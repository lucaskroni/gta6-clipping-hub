-- One-time import of data/backup-2026-11-18.json (already applied on Nov 18, 2026).
-- Safe to re-run: it only fills in rows that are missing.

insert into public.settings (id, name_a, name_b) values (1, 'Lucas', 'Leo')
  on conflict (id) do update set name_a = excluded.name_a, name_b = excluded.name_b;

insert into public.progress (task_id, done, count) values
  ('yt', true, 0), ('social', true, 0), ('verify', true, 0), ('opus', true, 0), ('campaigns', false, 0)
  on conflict (task_id) do nothing;

insert into public.campaigns (id, name, org, site, link, rate, rate_up_to, max_per_clip, budget_used, budget_total, budget, category, live, platforms, note, found_by, found_at, checked_at, status, pick_a, pick_b) values
  ('gta6-tokyo-girl', 'GTA 6 Clipping Campaign - Tokyo Girl', 'Placements', 'Content Rewards', 'https://contentrewards.com/c/campaigns/40046522-56d9-45ad-9198-faea8eca90c6', 0.7, false, 35, 88, 2000, '', 'gta6', true, '{"yt": false, "tt": true, "ig": true}', 'Music campaign: GTA 6-themed content using the song "Tokyo Girl" by Passive. Min payout $2 per clip.', 'claude', '2026-11-14T16:55:00Z', '2026-11-14T16:55:00Z', 'considering', false, false),
  ('gta6-ai-clipscales', 'GTA 6 x AI Clipping [Unlimited Budget]', 'ClipScales', 'Content Rewards', 'https://contentrewards.com/c/campaigns/9e62f31a-c6fc-4b98-9b3a-c762dd4ef85d', 1, false, 200, 0, 0, 'Unlimited', 'gta6', false, '{"yt": true, "tt": false, "ig": false}', 'Paused. Tier 1 countries only, DM the owner for a bio code first. Allows AI mass-posting, which risks YouTube''s spam rules.', 'claude', '2026-11-14T16:55:00Z', '2026-11-14T16:55:00Z', 'considering', false, false),
  ('cod-warzone-s1', 'Call of Duty - Warzone Season 1 Clipping', 'Clipping Culture (verified)', 'Content Rewards', 'https://contentrewards.com/c/campaigns/db285bc6-9a06-43ff-ae4b-4b5ebf149b8b', 2, true, 0, 28900, 40000, '', 'gaming', true, '{"yt": false, "tt": false, "ig": false}', 'Rate depends on viewers'' country.', 'claude', '2026-11-14T16:55:00Z', '2026-11-14T16:55:00Z', 'considering', false, false),
  ('cod-mw4-dmz', 'Call of Duty - MW4 DMZ Intel Briefing Clipping', 'Clipping Culture (verified)', 'Content Rewards', 'https://contentrewards.com/c/campaigns/a1cefc3b-4533-438f-8e70-a7299550f1cf', 2, true, 0, 5100, 30000, '', 'gaming', true, '{"yt": false, "tt": false, "ig": false}', 'Rate depends on viewers'' country. Lots of budget left.', 'claude', '2026-11-14T16:55:00Z', '2026-11-14T16:55:00Z', 'considering', false, false),
  ('sega-metaphor', 'SEGA - Metaphor ReFantazio Trailer Clipping', 'Clipping Culture (verified)', 'Content Rewards', 'https://contentrewards.com/c/campaigns/b5ff48d7-ec63-443a-b767-3a430a6f71f4', 2, true, 0, 260, 12000, '', 'gaming', true, '{"yt": false, "tt": false, "ig": false}', 'Trailer clipping, almost the whole budget left.', 'claude', '2026-11-14T16:55:00Z', '2026-11-14T16:55:00Z', 'considering', false, false),
  ('faze-tournament', '$8,500 FaZe Tournament Clipping Campaign', 'ClippedIn', 'Content Rewards', 'https://contentrewards.com/c/campaigns/200ea21b-be80-4db8-b552-8e32b148604e', 1, false, 0, 32, 8500, '', 'gaming', true, '{"yt": false, "tt": false, "ig": false}', 'Esports tournament clips. Almost the whole budget left.', 'claude', '2026-11-14T16:55:00Z', '2026-11-14T16:55:00Z', 'considering', false, false)
  on conflict (id) do nothing;

insert into public.clip_jobs (id, url, tool, length, count, who, status, error, created) values
  ('u3z9lagvi2o3v83wafes', 'https://www.youtube.com/watch?v=02nKv4rM_RM', 'OpusClip', 20, 2, 'a', 'error', 'Opus Clip needs a paid plan or more credits for this.', '2026-11-18T12:00:00Z')
  on conflict (id) do nothing;

insert into public.meta (key, value, updated_at) values
  ('scout', '{"last_run": "2026-11-14T16:55:00Z", "summary": "Content Rewards: 2 GTA 6 (1 paused) and 4 gaming. Vyro and Clipster: no GTA 6 yet."}', '2026-11-14T16:55:00Z'),
  ('opus_projects', '[{"projectId": "P3111414ZS2V", "title": "Spandauer Imbiss-Mogul | Fast Food Manager", "url": "https://clip.opus.pro/clip/P3111414ZS2V"}, {"projectId": "P3111414pkQp", "title": "I BROUGHT 5 STARS TO AN AAU TOURNAMENT & FIGHTS BROKE OUT!", "url": "https://clip.opus.pro/clip/P3111414pkQp"}]', now())
  on conflict (key) do nothing;
