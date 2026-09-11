'use strict';

// A scene = one spoken line + whatever the page should be doing while it plays.
// The scene stays on screen for exactly as long as its narration takes.
module.exports = [
  {
    chip: 'Sign in',
    say: 'This is the admin console. I will sign in and walk through each section.',
    goto: '/login',
    do: async (w) => {
      await w.type('input[type="email"]', 'demo@example.test', 'email');
      await w.type('input[type="password"]', 'demo-password', 'password');
      await w.click('button:has-text("Sign in")', 'sign in');
      await w.wait(1500);
    },
  },
  {
    chip: 'Overview',
    say: 'The overview opens on headline metrics for the current period.',
    do: async (w) => { await w.pan('[data-testid="kpi-card"]', 4); },
  },
  {
    chip: 'Records',
    say: 'Records lists every entry, filtered by status and owner.',
    do: async (w) => {
      await w.click('nav a:has-text("Records")', 'records nav');
      await w.pan('table tbody tr', 3);
    },
  },
  {
    chip: 'Detail',
    say: 'Opening a row shows its full history and the actions available on it.',
    do: async (w) => {
      await w.click('table tbody tr a', 'first record');
      await w.scroll(500);
    },
    pause: 1.5,
  },
  {
    chip: 'Phone view',
    say: 'The same console reflows for phones, so nothing is desktop-only.',
    phone: true,
    do: async (w) => { await w.scroll(400); },
  },
  {
    chip: 'Sign out',
    say: 'That is the full tour. Everything shown here runs against live data.',
    phone: false,
    do: async (w) => { await w.click('button:has-text("Sign out")', 'sign out'); },
    pause: 2,
  },
];
