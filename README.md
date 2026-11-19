# GTA 6 Clipping Hub

Our team app for clipping GTA 6: roadmap, clip studio, campaigns, and the rules.
Data is stored in Supabase, so Lucas and Leo see the same thing live.

## How it fits together
- `index.html`, `css/app.css`, `js/*.js`: the whole app. No build step: GitHub Pages serves these files as they are.
- `js/data.js`: the roadmap steps and tasks. **Never change a task `id`**, progress is saved by id.
- `js/config.js`: Supabase address + public key (safe to be public). Never put secret keys here.
- `supabase/migrations/`: the database tables and security rules, in the order they were applied.
- `supabase/seed/`: the one-time import of our Nov 18 backup (already done).
- `legacy/roadmap-artifact.html`: the original Claude artifact, kept for reference.

## Changing the app
Open this folder in Claude Code and ask for what you want. When it's done, ask it to commit and push.
GitHub Pages updates the live site about a minute after each push to `main`.

## Adding a person to the team
Only emails on the team list can sign in. Ask Claude Code: "add <email> to allowed_emails in Supabase".
