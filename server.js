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

// --- CONSTANTES E CONFIGURAÇÕES ---
const DB_FILE = './inscriptions.json';
const APOSTILA_DB_FILE = './apostilas_vendidas.json'; // Ficheiro separado para as vendas
const APOSTILA_PRICE = 0.10; // Preço da apostila

// As suas configurações originais
const MERCADO_PAGO_TOKEN = process.env.MERCADO_PAGO_TOKEN;
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL;
const EMAIL_CONFIG = {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
};

// --- CONFIGURAÇÃO DO TRANSPORTER DE E-MAIL ---
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: EMAIL_CONFIG.user, pass: EMAIL_CONFIG.pass },
});

// --- FUNÇÕES DE E-MAIL ---

// -> SUA FUNÇÃO ORIGINAL, INTOCADA <-
async function sendConfirmationEmail(inscription) {
    try {
        if (!EMAIL_CONFIG.user || !EMAIL_CONFIG.pass) {
            console.log("Credenciais de e-mail não configuradas. Pulando envio.");
            return;
        }
        await transporter.sendMail({
            from: `"Projeto NST TREINAMENTO" <${EMAIL_CONFIG.user}>`,
            to: inscription.email,
            subject: "Inscrição Confirmada - A Percepção do Analista",
            html: `<div style="font-family: Arial, sans-serif; color: #333;"><h1 style="color: #0D1B2A;">Olá, ${inscription.name}!</h1><p>Sua inscrição para o <strong>MÓDULO 1 - LUTO MAL RESOLVIDO</strong> foi confirmada com sucesso!</p><p><strong>Turma:</strong> ${inscription.product}</p><hr><h3>Instruções para o dia do evento:</h3><p>Para garantir um acesso tranquilo e seguro, será necessário apresentar um documento de identificação com foto (RG ou CNH) na entrada, juntamente com seu nome completo.</p><p>Aguardamos você!</p><br><p>Atenciosamente,</p><p>Equipe NST TREINAMENTO</p><hr><p style="font-size: 0.8em; color: #888;">Ficou com alguma dúvida? Envie um e-mail para: <a href="mailto:nilsonsantosterapeuta@gmail.com">nilsonsantosterapeuta@gmail.com</a><br><em>Por favor, não responda a este e-mail, pois ele foi gerado automaticamente.</em></p></div>`,
        });
        console.log(`✉️ E-mail de confirmação enviado para ${inscription.email}`);
    } catch (error) {
        console.error(`Falha ao enviar e-mail para ${inscription.email}:`, error);
    }
}

// -> NOVA FUNÇÃO, APENAS PARA A APOSTILA <-
async function sendApostilaEmail(sale) {
    try {
        const apostilaPath = path.join(__dirname, 'apostila.pdf');
        if (!fs.existsSync(apostilaPath)) {
            console.error("ERRO CRÍTICO: Ficheiro da apostila (apostila.pdf) não encontrado.");
            return;
        }
        await transporter.sendMail({
            from: `"Projeto NST TREINAMENTO" <${EMAIL_CONFIG.user}>`,
            to: sale.email,
            subject: "Sua Apostila chegou! - Módulo I: Luto Mal Resolvido",
            html: `<div style="font-family: Arial, sans-serif; color: #333;"><h1 style="color: #0D1B2A;">Olá, ${sale.name}!</h1><p>Obrigado por sua compra! Sua apostila do <strong>MÓDULO 1 - LUTO MAL RESOLVIDO</strong> está em anexo neste e-mail.</p><p>Bons estudos!</p><br><p>Atenciosamente,</p><p>Equipe NST TREINAMENTO</p></div>`,
            attachments: [{ filename: 'Apostila - Luto Mal Resolvido.pdf', path: apostilaPath, contentType: 'application/pdf' }]
        });
        console.log(`✉️ Apostila enviada com sucesso para ${sale.email}`);
    } catch (error) {
        console.error(`Falha ao enviar e-mail com apostila para ${sale.email}:`, error);
    }
}


// --- FUNÇÕES DE BANCO DE DADOS (JSON) ---
const readDatabase = () => {
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
};
const writeDatabase = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};
const readApostilaDb = () => {
    if (!fs.existsSync(APOSTILA_DB_FILE)) fs.writeFileSync(APOSTILA_DB_FILE, '[]');
    return JSON.parse(fs.readFileSync(APOSTILA_DB_FILE, 'utf-8'));
}
const writeApostilaDb = (data) => {
    fs.writeFileSync(APOSTILA_DB_FILE, JSON.stringify(data, null, 2));
}

// --- ROTAS DA APLICAÇÃO ---

app.get('/admin/data', (req, res) => {
    const db = readDatabase();
    res.json(db.filter(insc => insc.status === 'paid'));
});

// -> SUA ROTA ORIGINAL, INTOCADA <-
app.post('/create-payment', async (req, res) => {
    if (!MERCADO_PAGO_TOKEN || !PUBLIC_URL) {
        return res.status(500).json({ error: "O servidor não está configurado corretamente." });
    }
    const { fullName, email, turma, cpf } = req.body;
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts.shift();
    const lastName = nameParts.join(' ');
    const cleanedCpf = cpf.replace(/[^\d]/g, "");
    const itemName = `MÓDULO I (${turma === 'quarta_3007' ? 'Quarta' : 'Sábado'})`;
    const itemPrice = 29.00;
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
        res.json({ inscriptionId: newInscription.id, qrCodeText: qrData.qr_code, qrCodeBase64: qrData.qr_code_base64 });
    } catch (error) {
        console.error("Erro ao criar pagamento:", error.response ? JSON.stringify(error.response.data) : error.message);
        res.status(500).json({ error: "Não foi possível criar o pagamento." });
    }
});

// -> NOVA ROTA, APENAS PARA A APOSTILA <-
app.post('/create-payment-apostila', async (req, res) => {
    if (!MERCADO_PAGO_TOKEN || !PUBLIC_URL) {
        return res.status(500).json({ error: "O servidor não está configurado corretamente." });
    }
    const { fullName, email, cpf } = req.body;
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts.shift();
    const lastName = nameParts.join(' ');
    const cleanedCpf = cpf.replace(/[^\d]/g, "");
    const newSale = {
        id: `apostila_${Date.now()}`, name: fullName, email, cpf: cleanedCpf,
        product: 'Apostila Digital - Módulo I', status: 'pending', createdAt: new Date().toISOString(), payment_id: null
    };
    const paymentData = {
        transaction_amount: APOSTILA_PRICE, description: 'Apostila Digital - Módulo I', payment_method_id: 'pix',
        payer: { email, first_name: firstName, last_name: lastName, identification: { type: 'CPF', number: cleanedCpf }},
        notification_url: `${PUBLIC_URL}/webhook-mp`,
        external_reference: newSale.id,
    };
    try {
        const response = await axios.post('https://api.mercadopago.com/v1/payments', paymentData, {
            headers: { 'Authorization': `Bearer ${MERCADO_PAGO_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': newSale.id }
        });
        newSale.payment_id = response.data.id;
        const db = readApostilaDb();
        db.push(newSale);
        writeApostilaDb(db);
        console.log(`[+] Venda de apostila criada: ${newSale.id}`);
        const qrData = response.data.point_of_interaction.transaction_data;
        res.json({ purchaseId: newSale.id, qrCodeText: qrData.qr_code, qrCodeBase64: qrData.qr_code_base64 });
    } catch (error) {
        console.error("Erro ao criar pagamento da apostila:", error.response ? JSON.stringify(error.response.data) : error.message);
        res.status(500).json({ error: "Não foi possível criar o pagamento." });
    }
});

// -> ROTA MODIFICADA PARA LIDAR COM OS DOIS CASOS <-
app.get('/check-status', (req, res) => {
    const { id } = req.query; // Mudado de inscriptionId para um 'id' genérico
    if (!id) return res.status(400).json({ error: 'ID é necessário.' });
    
    let item = null;
    if (id.startsWith('insc_')) {
        const db = readDatabase();
        item = db.find(i => i.id === id);
    } else if (id.startsWith('apostila_')) {
        const db = readApostilaDb();
        item = db.find(i => i.id === id);
    }
    if (item) {
        res.json({ status: item.status });
    } else {
        res.status(404).json({ error: 'Registo não encontrado.' });
    }
});

// -> WEBHOOK MODIFICADO PARA LIDAR COM OS DOIS CASOS <-
app.post('/webhook-mp', async (req, res) => {
    const notification = req.body;
    if (notification.type === 'payment' && MERCADO_PAGO_TOKEN) {
        try {
            const paymentDetails = await axios.get(`https://api.mercadopago.com/v1/payments/${notification.data.id}`, {
                headers: { 'Authorization': `Bearer ${MERCADO_PAGO_TOKEN}` }
            });
            const { status, external_reference } = paymentDetails.data;
            if (status === 'approved' && external_reference) {
                if (external_reference.startsWith('insc_')) {
                    const db = readDatabase();
                    const index = db.findIndex(i => i.id === external_reference);
                    if (index > -1 && db[index].status !== 'paid') {
                        db[index].status = 'paid';
                        writeDatabase(db);
                        console.log(`✅ [Webhook] Inscrição ${external_reference} atualizada para 'pago'!`);
                        if (EMAIL_CONFIG.user) sendConfirmationEmail(db[index]);
                    }
                } else if (external_reference.startsWith('apostila_')) {
                    const db = readApostilaDb();
                    const index = db.findIndex(s => s.id === external_reference);
                    if (index > -1 && db[index].status !== 'paid') {
                        db[index].status = 'paid';
                        writeApostilaDb(db);
                        console.log(`✅ [Webhook] Venda ${external_reference} atualizada para 'paga'!`);
                        if (EMAIL_CONFIG.user) sendApostilaEmail(db[index]);
                    }
                }
            }
        } catch (error) { console.error("Erro no webhook:", error.message); }
    }
    res.sendStatus(200);
});

// --- INICIAR O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});