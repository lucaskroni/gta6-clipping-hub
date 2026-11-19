# GTA 6 Clipping Hub

Project brief for Claude Code. Read this first in every session.

## Who and what
- Team of two clippers in Austria: **Lucas** (Clipper 1, owner) and **Leo** (Clipper 2). Both beginners.
- Niche: **GTA 6 clips only** (launch: Thu Nov 19, 2026, PS5 / Xbox Series X|S; no PC version yet).
- Money: paid streamer clipping campaigns first (Content Rewards via Whop, Vyro, Clipster, ClipAffiliates, KICK), own YouTube channel second.
- Talk to the team in plain, friendly English. They are not developers: explain steps simply.

## Goal of this project
Turn the existing Claude artifact (`legacy/roadmap-artifact.html`, one self-contained HTML page) into a real, independently hosted web app that both of them can use and edit, with:
1. **Shared data in Supabase** (both see the same ticks, campaigns and clip jobs live).
2. **Code on GitHub** (repo shared with Leo as collaborator), deployed automatically (GitHub Pages, Vercel or Netlify, whichever is simplest and free).
3. **No lost progress:** import `data/backup-2026-11-18.json` into Supabase on first setup.
4. Both can change the app later by asking Claude Code in this repo.

## Features to keep (all exist in the legacy page)
Four pages with a sticky top nav (Roadmap, Clip studio, Campaigns, Guide & rules), plus a countdown to Nov 19 and both names editable at the top.
- **Roadmap:** 4 steps (Launch prep Nov 14-18, Launch week Nov 19-25, Ride the wave Nov 26-Dec 16, Make it last Dec 17-Jan 13). Each step = sections of task cards. Tasks are toggles or counters (e.g. "Post 30 clips this week"), each owned by A, B or both, worth points; finishing a step unlocks a badge (Bronze/Silver/Gold/Platinum). Filter by person. Users can add their own tasks per step. Task ids must stay stable (progress is keyed by task id).
- **Clip studio** (dark, neon, creator-app look, different from the rest): paste a YouTube link, pick tool (Opus Clip or Everygen), clip length (15/20/30/45/60 s), clip count (1-10), who added it. Shows jobs with status, then the clips as 9:16 "phone cards" (rank, length, score, hook). "Write hooks with Claude" writes an English hook (max 8 words) per clip.
- **Campaigns:** cards with category strip (GTA 6 / Gaming), New/Paused/Joined badges, big pay rate per 1K views, max per clip, budget left + meter, platforms, note, "Who's in?" initials toggles for Lucas/Leo, Open campaign / Mark as joined / Drop / Remove. Filters: All active, GTA 6, Gaming, Joined. "Last checked" box from the scout.
- **Guide & rules:** daily routine (Clipper 1 finds + picks, Clipper 2 polishes + posts, swap weekly), toolkit, GTA 6 rules (below).
- Comments on cards (in the artifact this used Claude's comment system; in the real app a simple comments table is fine).

## Data model (from the artifact database; map to Supabase tables)
- `settings`: nameA, nameB.
- `progress`: task_id, done (bool), count (int).
- `custom_tasks`: step (0-3), title, how, owner (a|b|both), created.
- `campaigns`: name, org, site, link, rate, rate_up_to, max_per_clip, budget_used, budget_total, budget (text), category (gta6|gaming|other), live, platforms (yt/tt/ig), note, found_by (claude|team), found_at, checked_at, status (considering|joined|dropped), pick_a, pick_b.
- `clip_jobs`: url, tool, length, count, who, owner_id, status (queued|starting|processing|done|error), project_id, job_id, share_url, title, error, clips (jsonb: title, duration, score, preview, hook), created, finished.
- `scout_runs` / `meta`: last_run, summary.
Use Row Level Security. Only Lucas and Leo should be able to read/write (simple email magic-link login with an allow-list of their two emails is enough).

## Automations
- **Campaign scout** (twice a day, ~08:43 and 19:43 Vienna): check Content Rewards discover page (https://contentrewards.com/c/discover), Vyro (https://vyro.com/campaigns) and Clipster (https://www.clipster.com/discover) for GTA 6 and gaming campaigns; add new ones, update rate/budget/live on existing ones, never overwrite the team's status/picks/notes. The old Claude scheduled task for this needed Lucas's computer to be online and got suspended. Make it run in the cloud (e.g. a Supabase Edge Function on a cron, or a GitHub Action), or as a Claude Code scheduled task that does not need the computer.
- **Clipping:** Opus Clip has an API/MCP (submit project with clip duration buckets, then poll list clips); Everygen has an MCP (find_clips, get_clips_status) but needs a paid plan. Check what each offers to a normal web app (API keys, plans) before building; keep keys in Supabase secrets / server side, never in the browser.

## GTA 6 rules (show in the app, respect in features)
1. No story cutscenes or the ending (Rockstar removes isolated cinematics and spoilers).
2. No leaked pre-release footage.
3. Mute or replace the in-game radio (Content ID claims).
4. No NPC-massacre / shock compilations (YouTube demonetizes).
5. No GTA logo or Rockstar art as channel branding, no "official"-sounding name.
6. Always add their own hook; never post AI output untouched. No AI-generated fake gameplay.
7. Never buy views. Take-Two's video policy only covers non-commercial use, so any video can be taken down.
8. Split money in writing; in Austria a two-person business may count as a GesbR, so they should see a tax advisor once money comes in.

## Design notes
- Light/dark aware app (purple accent #6a3df0, Figtree font), Clip studio is its own dark neon world (pink #ff2d87, violet #7b2cff, cyan #00e0ff, Unbounded display font).
- One consistent button system (36 px height, 10 px radius), clear hierarchy on cards.
- Everything readable on a phone.

## Hosted app (set up Nov 19, 2026)
- Live: https://lucaskroni.github.io/gta6-clipping-hub/ (GitHub Pages from `main`, root folder, no build step). Repo: github.com/lucaskroni/gta6-clipping-hub (public).
- Supabase project `mlomhwirajypaakpnmkz` (org "Clipping_Program", free plan, eu-north-1). Schema in `supabase/migrations/`; add new changes as new numbered files and apply them.
- Login: email magic link. Only emails in `public.allowed_emails` can sign up (trigger on `auth.users`) or read/write (RLS via `public.is_team()`). Never commit emails to this public repo; add them with SQL only.
- Supabase's built-in email only delivers to members of the Supabase org, so each teammate must be invited to the org (or set up custom SMTP).
- Not built yet: automatic clipping (Opus Clip API), "Write hooks with Claude" (needs an Anthropic API key in Supabase secrets), the cloud campaign scout. Clip studio currently queues links only.

## Known state (Nov 18, 2026)
- Lucas ticked: YouTube channel, TikTok/Instagram, verify, Opus Clip sign-up. Campaign task not done.
- Opus Clip account is on a trial; last clip job failed with "needs a paid plan or more credits".
- Tool choice so far: Opus Clip (free tier, then Starter $15/month). Everygen only if they want a paid plan.
