// Gestion du formulaire de shotgun
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('shotgun-form');
    if (!form) return;

    const btn = document.getElementById('shotgun-btn');
    const messageDiv = document.getElementById('shotgun-message');
    const slotIdInput = document.getElementById('slot-id');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Désactiver le bouton pendant la requête
        btn.disabled = true;
        btn.textContent = 'Chargement...';
        btn.classList.add('opacity-50');

        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const slotId = slotIdInput.value;

        try {
            const response = await fetch(`/shotgun/${slotId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ firstName, lastName, phone })
            });

            const data = await response.json();

            messageDiv.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800');

            if (data.success) {
                // Succès !
                messageDiv.classList.add('bg-green-100', 'text-green-800');
                messageDiv.innerHTML = `
                    <p class="font-bold text-lg">${data.message}</p>
                    <p class="mt-2">Tu peux retrouver ta réservation dans <a href="/mes-allos" class="underline">Mes Allo's</a>.</p>
                `;

                // Masquer le formulaire
                form.style.display = 'none';
            } else {
                // Échec
                messageDiv.classList.add('bg-red-100', 'text-red-800');
                messageDiv.innerHTML = `<p class="font-medium">${data.message}</p>`;

                // Réactiver le bouton
                btn.disabled = false;
                btn.textContent = 'SHOTGUN !';
                btn.classList.remove('opacity-50');

                // Rafraîchir la page après 2 secondes si le slot est pris
                if (response.status === 409) {
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Erreur:', error);
            messageDiv.classList.remove('hidden');
            messageDiv.classList.add('bg-red-100', 'text-red-800');
            messageDiv.innerHTML = '<p>Une erreur est survenue. Réessaie.</p>';

            btn.disabled = false;
            btn.textContent = 'SHOTGUN !';
            btn.classList.remove('opacity-50');
        }
    });
});
