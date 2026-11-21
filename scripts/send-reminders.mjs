// Sends one "How does your mind feel?" notification to every subscribed iPhone, unless it's quiet hours.
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), PUSH_SUBSCRIPTIONS (one code or a JSON array of codes),
//      TIMEZONE (e.g. Asia/Kolkata), QUIET_HOURS (e.g. "23:30-07:30, 14:00-15:00"), FORCE=1 to ignore quiet hours (test).
import webpush from 'web-push';

const env = process.env;
const tz = env.TIMEZONE || 'Asia/Kolkata';
const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
const now = Number(parts.find((p) => p.type === 'hour').value) % 24 * 60 + Number(parts.find((p) => p.type === 'minute').value);
const toMin = (t) => { const [h, m] = t.trim().split(':').map(Number); return h * 60 + (m || 0); };
const quiet = (env.QUIET_HOURS || '23:30-07:30').split(',').filter((r) => r.includes('-')).map((r) => r.split('-').map(toMin));
const inQuiet = quiet.some(([s, e]) => (s <= e ? now >= s && now < e : now >= s || now < e));
if (inQuiet && env.FORCE !== '1') { console.log(`Quiet hours in ${tz} (${Math.floor(now / 60)}:${String(now % 60).padStart(2, '0')}); nothing sent.`); process.exit(0); }

let subs;
try { const raw = JSON.parse(env.PUSH_SUBSCRIPTIONS || '[]'); subs = Array.isArray(raw) ? raw : [raw]; }
catch (e) { console.error('PUSH_SUBSCRIPTIONS is not valid JSON. Paste the code from MoodTrack → Settings exactly.'); process.exit(1); }
if (!subs.length) { console.log('No subscriptions yet. Add the code from MoodTrack → Settings as the PUSH_SUBSCRIPTIONS secret.'); process.exit(0); }

webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:moodtrack@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
const payload = JSON.stringify({ title: 'How does your mind feel right now?', body: 'Tap to log it in MoodTrack.' });
let failed = 0;
for (const [i, s] of subs.entries()) {
  try { await webpush.sendNotification(s, payload, { TTL: 1800, urgency: 'normal' }); console.log(`Sent to subscription ${i + 1}.`); }
  catch (e) {
    failed++;
    console.error(`Subscription ${i + 1} failed: ${e.statusCode || ''} ${e.body || e.message}`);
    if (e.statusCode === 404 || e.statusCode === 410) console.error('  This code has expired: in MoodTrack → Settings tap Redo, turn notifications on again and update the secret.');
  }
}
process.exit(failed === subs.length ? 1 : 0);
