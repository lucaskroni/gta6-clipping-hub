# Start here: moving the GTA 6 Clipping Hub to Claude Code

## 1. Install Claude Code (pick one)
- Easiest: open the Claude desktop app, sign in, and use the **Code** tab.
- Terminal on Mac: `curl -fsSL https://claude.ai/install.sh | bash`
- Terminal on Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`

## 2. Open this folder
Unzip this folder somewhere you'll find it (for example in Documents), then:
- Desktop app: Code tab → choose this folder.
- Terminal: `cd` into this folder and type `claude`.

## 3. Paste this as your first message

> Read CLAUDE.md. Then help me turn legacy/roadmap-artifact.html into a real web app: create a GitHub repo for it (and tell me how to add Leo as a collaborator), set up a Supabase project with the tables from CLAUDE.md and login for just Lucas and Leo, import data/backup-2026-11-18.json so we keep our progress, and deploy it for free. Explain each step simply and ask me before anything that costs money.

## 4. Connect GitHub and Supabase
Claude Code will ask you to sign in to GitHub (it uses the `gh` tool) and to connect Supabase. Say yes when it asks; it walks you through it.

## 5. Leo
Once the repo exists, Leo installs Claude Code too, clones the repo, and can change the app by asking his own Claude Code in that folder.
