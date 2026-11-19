-- Logged-out visitors don't need to call these.
revoke execute on function public.is_team() from anon;
revoke execute on function public.only_team_can_sign_up() from anon, authenticated;
