const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '')));

const DB_FILE = './inscriptions.json';

// Lendo as chaves de forma segura do ambiente de hospedagem
const MERCADO_PAGO_TOKEN = process.env.MERCADO_PAGO_TOKEN;
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL;
const EMAIL_CONFIG = {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
};

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: EMAIL_CONFIG.user, pass: EMAIL_CONFIG.pass },
});

async function sendConfirmationEmail(inscription) {
    try {
        if (!EMAIL_CONFIG.user || !EMAIL_CONFIG.pass) {
            console.log("Credenciais de e-mail não configuradas. Pulando envio.");
            return;
        }
        await transporter.sendMail({
            from: `"Projeto Lúmen" <${EMAIL_CONFIG.user}>`,
            to: inscription.email,
            subject: "Inscrição Confirmada - A Percepção do Analista",
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h1 style="color: #0D1B2A;">Olá, ${inscription.name}!</h1>
                    <p>Sua inscrição para o <strong>Módulo I - Luto Mal Resolvido</strong> foi confirmada com sucesso!</p>
                    <p><strong>Turma:</strong> ${inscription.product}</p>
                    <hr>
                    <h3>Instruções para o dia do evento:</h3>
                    <p>Para garantir um acesso tranquilo e seguro, será necessário apresentar um documento de identificação com foto (RG ou CNH) na entrada, juntamente com seu nome completo.</p>
                    <p>Aguardamos você!</p>
                    <br>
                    <p>Atenciosamente,</p>
                    <p>Equipe Projeto Lúmen</p>
                    <hr>
                    <p style="font-size: 0.8em; color: #888;">
                        Ficou com alguma dúvida? Envie um e-mail para: <a href="mailto:nilsonsantosterapeuta@gmail.com">nilsonsantosterapeuta@gmail.com</a>
                        <br>
                        <em>Por favor, não responda a este e-mail, pois ele foi gerado automaticamente.</em>
                    </p>
                </div>
            `,
        });
        console.log(`✉️ E-mail de confirmação enviado para ${inscription.email}`);
    } catch (error) {
        console.error(`Falha ao enviar e-mail para ${inscription.email}:`, error);
    }
}

const readDatabase = () => {
    if (!fs.existsSync(DB_FILE)) { fs.writeFileSync(DB_FILE, '[]'); }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
};
const writeDatabase = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

app.get('/admin/data', (req, res) => {
    const db = readDatabase();
    const paidInscriptions = db.filter(insc => insc.status === 'paid');
    res.json(paidInscriptions);
});

app.post('/create-payment', async (req, res) => {
    if (!MERCADO_PAGO_TOKEN || !PUBLIC_URL) {
        return res.status(500).json({ error: "O servidor não está configurado corretamente. Faltam as chaves de API." });
    }
    const { fullName, email, turma, cpf } = req.body;
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts.shift();
    const lastName = nameParts.join(' ');
    const cleanedCpf = cpf.replace(/[^\d]/g, "");
    const itemName = `MÓDULO I (${turma === 'quarta_3007' ? 'Quarta' : 'Sábado'})`;
    const itemPrice = 25.00;
    const newInscription = {
        id: `insc_${Date.now()}`, name: fullName, email: email, cpf: cleanedCpf,
        product: itemName, status: 'pending', createdAt: new Date().toISOString(), payment_id: null
    };
    const paymentData = {
        transaction_amount: itemPrice, description: itemName, payment_method_id: 'pix',
        payer: { email: email, first_name: firstName, last_name: lastName, identification: { type: 'CPF', number: cleanedCpf }},
        notification_url: `${PUBLIC_URL}/webhook-mp`, 
        external_reference: newInscription.id,
    };
    try {
        const response = await axios.post('https://api.mercadopago.com/v1/payments', paymentData, {
            headers: { 'Authorization': `Bearer ${MERCADO_PAGO_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': newInscription.id }
        });
        newInscription.payment_id = response.data.id;
        const db = readDatabase();
        db.push(newInscription);
        writeDatabase(db);
        console.log(`[+] Inscrição criada: ${newInscription.id}`);
        const qrData = response.data.point_of_interaction.transaction_data;
        res.json({
            inscriptionId: newInscription.id,
            qrCodeText: qrData.qr_code,
            qrCodeBase64: qrData.qr_code_base64
        });
    } catch (error) {
        console.error("Erro ao criar pagamento:", error.response ? JSON.stringify(error.response.data) : error.message);
        res.status(500).json({ error: "Não foi possível criar o pagamento." });
    }
});

app.get('/check-status', (req, res) => {
    const { inscriptionId } = req.query;
    if (!inscriptionId) return res.status(400).json({ error: 'ID da inscrição é necessário.' });
    const db = readDatabase();
    const inscription = db.find(insc => insc.id === inscriptionId);
    if (inscription) { res.json({ status: inscription.status });
    } else { res.status(404).json({ error: 'Inscrição não encontrada.' }); }
});

app.post('/webhook-mp', async (req, res) => {
    const notification = req.body;
    if (notification.type === 'payment' && MERCADO_PAGO_TOKEN) {
        try {
            const paymentDetails = await axios.get(`https://api.mercadopago.com/v1/payments/${notification.data.id}`, {
                headers: { 'Authorization': `Bearer ${MERCADO_PAGO_TOKEN}` }
            });
            const { status, external_reference } = paymentDetails.data;
            if (status === 'approved' && external_reference) {
                const db = readDatabase();
                const inscriptionIndex = db.findIndex(insc => insc.id === external_reference);
                if (inscriptionIndex > -1 && db[inscriptionIndex].status !== 'paid') {
                    db[inscriptionIndex].status = 'paid';
                    writeDatabase(db);
                    console.log(`✅ [Webhook] Inscrição ${external_reference} atualizada para 'pago'!`);
                    if (EMAIL_CONFIG.user && EMAIL_CONFIG.pass) {
                        sendConfirmationEmail(db[inscriptionIndex]);
                    }
                }
            }
        } catch (error) { console.error("Erro no webhook:", error.message); }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});