# 📜 OpenLaw Petition Signer (React + Vite)

A minimal, good-looking React app that:
1) logs into your OpenLaw workspace,
2) renders a **Petition** template as a form,
3) previews the agreement,
4) creates an OpenLaw **contract**, and
5) opens the hosted OpenLaw page to **sign**.

It also supports downloading the PDF and (optionally) checking status after signing.

---

## Features

- OpenLaw template execution via `Openlaw` (ESM build)
- Auto-generated form with **openlaw-elements**
- Contract creation via **APIClient.uploadContract**
- One-click “Open in OpenLaw to sign”
- Tailwind CSS styling
- Absolute link generation to avoid `/undefined/contract/...` issues

---

## Requirements

- **Node.js 18+**
- **npm** (or pnpm/yarn if you prefer)

---

## Install & Run

```bash
# 1) Install deps
npm install

# 2) (Optional) Create .env with your OpenLaw API root.
#    We intentionally commit .env / .env.local in this repo (no secrets here).
#    Example:
#    VITE_OPENLAW_ROOT=https://lib.openlaw.io/api/v1/default

# 3) Start dev server
npm run dev
