document.addEventListener('DOMContentLoaded', () => {
    let allInscriptions = [];

    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const updateMetrics = (data) => {
        document.getElementById('total-paid').textContent = data.length;
        const totalRevenue = data.length * 25;
        document.getElementById('total-revenue').textContent = formatCurrency(totalRevenue);
        const quartaCount = data.filter(insc => insc.product.includes('Quarta')).length;
        const sabadoCount = data.filter(insc => insc.product.includes('Sábado')).length;
        document.getElementById('quarta-count').textContent = quartaCount;
        document.getElementById('sabado-count').textContent = sabadoCount;
    };

    const renderChart = (data) => {
        const inscriptionsByDay = {};
        data.forEach(insc => {
            const day = new Date(insc.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            inscriptionsByDay[day] = (inscriptionsByDay[day] || 0) + 1;
        });
        const ctx = document.getElementById('inscriptions-chart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(inscriptionsByDay),
                datasets: [{
                    label: 'Inscrições por Dia',
                    data: Object.values(inscriptionsByDay),
                    backgroundColor: 'rgba(61, 132, 230, 0.5)',
                    borderColor: 'rgba(61, 132, 230, 1)',
                    borderWidth: 1
                }]
            },
            options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    };

    const renderTable = (data) => {
        const tableBody = document.querySelector("#inscriptions-table tbody");
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma inscrição paga encontrada.</td></tr>';
            return;
        }
        const sortedData = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        sortedData.forEach(insc => {
            const row = document.createElement('tr');
            const formattedDate = new Date(insc.createdAt).toLocaleString('pt-BR');
            row.innerHTML = `
                <td>${formattedDate}</td>
                <td>${insc.name}</td>
                <td>${insc.email}</td>
                <td>${insc.product}</td>
            `;
            tableBody.appendChild(row);
        });
    };

    function exportToCsv(data) {
        const sortedData = data.sort((a, b) => a.name.localeCompare(b.name));
        const headers = "Data,Nome,Email,CPF,Produto\n";
        const rows = sortedData.map(insc => {
            const date = new Date(insc.createdAt).toLocaleString('pt-BR');
            return `"${date}","${insc.name}","${insc.email}","${insc.cpf}","${insc.product}"`;
        }).join('\n');
        const csvContent = headers + rows;
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "lista_de_inscritos.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    document.getElementById('search-input').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredData = allInscriptions.filter(insc => 
            insc.name.toLowerCase().includes(searchTerm) || 
            insc.email.toLowerCase().includes(searchTerm)
        );
        renderTable(filteredData);
    });

    document.getElementById('export-csv-btn').addEventListener('click', () => {
        exportToCsv(allInscriptions);
    });

    const initializeDashboard = async () => {
        try {
            const response = await fetch('/admin/data');
            if (!response.ok) throw new Error('Não foi possível carregar os dados.');
            allInscriptions = await response.json();
            updateMetrics(allInscriptions);
            renderChart(allInscriptions);
            renderTable(allInscriptions);
        } catch (error) {
            alert(error.message);
        }
    };

    initializeDashboard();
});