/**
 * Seeded SaaS event simulator → product_analytics.pa_events.
 *
 * Usage: bun run dev/product-analytics/generate.ts
 * Env:   PA_PEOPLE (default 25000), PA_DAYS (default 120),
 *        CLICKHOUSE_URL (default http://127.0.0.1:18123)
 */

const CH = process.env.CLICKHOUSE_URL ?? "http://127.0.0.1:18123";
const SEED = "pa-prototype-v1";
const PEOPLE = Number(process.env.PA_PEOPLE ?? 25000);
const DAYS = Number(process.env.PA_DAYS ?? 120);
const WEBSITE_ID = "prototype";
const HOSTNAME = "app.example.com";
const SESSION_GAP_MS = 30 * 60 * 1000;
const BATCH = 20_000;
const END_MS = new Date().setUTCHours(0, 0, 0, 0);
const START_MS = END_MS - DAYS * 86_400_000;
const INCIDENT_START = START_MS + 84 * 86_400_000;
const INCIDENT_END = INCIDENT_START + 7 * 86_400_000;

type Persona = "power" | "regular" | "casual" | "churned";
type Plan = "starter" | "pro" | "business";

type EventRow = {
  website_id: string;
  session_id: string;
  visit_id: string;
  event_type: number;
  event_name: string | null;
  url_path: string;
  hostname: string;
  referrer_domain: string | null;
  referrer_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  browser: string;
  os: string;
  device: string;
  country: string;
  distinct_id: string | null;
  visitor_id: string;
  created_at: string;
  event_data: Record<string, string>;
};

type GroundTruth = {
  seed: string;
  people: number;
  days: number;
  start: string;
  end: string;
  incident: { start: string; end: string };
  counts: Record<string, number>;
  funnel: { pricing: number; trial_started: number; checkout_completed: number };
  inviteWeek1: number;
  twoDevicePeople: number;
};

const COUNTRIES: [string, number][] = [
  ["US", 0.4],
  ["GB", 0.12],
  ["DE", 0.1],
  ["FR", 0.08],
  ["CA", 0.07],
  ["AU", 0.06],
  ["IN", 0.05],
  ["BR", 0.04],
  ["NL", 0.04],
  ["JP", 0.04],
];

const PAGE_NEXT: Record<string, [string, number][]> = {
  "/": [
    ["/", 0.22],
    ["/pricing", 0.28],
    ["/docs/start", 0.18],
    ["/blog/launch", 0.14],
    ["/signup", 0.18],
  ],
  "/pricing": [
    ["/pricing", 0.12],
    ["/signup", 0.42],
    ["/docs/start", 0.18],
    ["/", 0.28],
  ],
  "/signup": [
    ["/signup", 0.2],
    ["/pricing", 0.3],
    ["/", 0.5],
  ],
  "/docs/start": [
    ["/docs/start", 0.28],
    ["/docs/api", 0.32],
    ["/", 0.2],
    ["/pricing", 0.2],
  ],
  "/docs/api": [
    ["/docs/api", 0.35],
    ["/docs/start", 0.3],
    ["/", 0.35],
  ],
  "/blog/launch": [
    ["/blog/launch", 0.2],
    ["/blog/metrics", 0.25],
    ["/", 0.35],
    ["/pricing", 0.2],
  ],
  "/blog/metrics": [
    ["/blog/metrics", 0.25],
    ["/", 0.45],
    ["/pricing", 0.3],
  ],
  "/app": [
    ["/app", 0.28],
    ["/app/reports", 0.36],
    ["/app/settings", 0.16],
    ["/app/checkout", 0.2],
  ],
  "/app/reports": [
    ["/app/reports", 0.4],
    ["/app", 0.35],
    ["/app/settings", 0.25],
  ],
  "/app/settings": [
    ["/app/settings", 0.3],
    ["/app", 0.5],
    ["/app/reports", 0.2],
  ],
  "/app/checkout": [
    ["/app/checkout", 0.35],
    ["/app", 0.45],
    ["/pricing", 0.2],
  ],
};

function hashString(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rngFrom(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state = Math.imul(state + 0x6d2b79f5, 0x9e3779b9) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rng: () => number, items: [T, number][]): T {
  let r = rng();
  for (const [item, weight] of items) {
    r -= weight;
    if (r <= 0) {
      return item;
    }
  }
  const last = items[items.length - 1];
  if (last === undefined) {
    throw new Error("pickWeighted: empty list");
  }
  return last[0];
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) {
    throw new Error("pick: empty list");
  }
  return item;
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function nextPage(rng: () => number, current: string): string {
  const edges = PAGE_NEXT[current] ?? PAGE_NEXT["/"];
  if (!edges) {
    return "/";
  }
  const total = edges.reduce((sum, [, w]) => sum + w, 0);
  return pickWeighted(
    rng,
    edges.map(([path, w]) => [path, w / total]),
  );
}

function deviceProfile(rng: () => number): {
  device: string;
  os: string;
  browser: string;
} {
  const device = pickWeighted(rng, [
    ["desktop", 0.7],
    ["mobile", 0.25],
    ["tablet", 0.05],
  ]);
  if (device === "mobile") {
    const os = pickWeighted(rng, [
      ["iOS", 0.55],
      ["Android", 0.45],
    ]);
    return {
      device,
      os,
      browser: os === "iOS" ? "Safari" : pickWeighted(rng, [
        ["Chrome", 0.85],
        ["Firefox", 0.15],
      ]),
    };
  }
  if (device === "tablet") {
    return { device, os: "iOS", browser: "Safari" };
  }
  const os = pickWeighted(rng, [
    ["macOS", 0.45],
    ["Windows", 0.48],
    ["Linux", 0.07],
  ]);
  return {
    device,
    os,
    browser: pickWeighted(rng, [
      ["Chrome", 0.62],
      ["Safari", os === "macOS" ? 0.25 : 0.05],
      ["Firefox", 0.18],
      ["Edge", 0.15],
    ]),
  };
}

function personaOf(rng: () => number): Persona {
  return pickWeighted(rng, [
    ["power", 0.08],
    ["regular", 0.25],
    ["casual", 0.45],
    ["churned", 0.22],
  ]);
}

function dailyActiveChance(persona: Persona, weekFromSignup: number, invited: boolean): number {
  const bonus = invited ? 0.12 : 0;
  const curves: Record<Persona, number[]> = {
    power: [0.9, 0.88, 0.85, 0.83, 0.8, 0.78, 0.75],
    regular: [0.62, 0.5, 0.42, 0.38, 0.34, 0.32, 0.3],
    casual: [0.38, 0.22, 0.16, 0.13, 0.11, 0.1, 0.09],
    churned: [0.35, 0.12, 0.03, 0, 0, 0, 0],
  };
  const curve = curves[persona];
  const base = curve[Math.min(weekFromSignup, curve.length - 1)] ?? 0;
  return Math.min(0.98, base + bonus);
}

function eventsOnActiveDay(persona: Persona, rng: () => number): number {
  const spans: Record<Persona, [number, number]> = {
    power: [4, 12],
    regular: [2, 6],
    casual: [1, 3],
    churned: [1, 3],
  };
  const [lo, hi] = spans[persona];
  return lo + Math.floor(rng() * (hi - lo + 1));
}

async function chQuery(sql: string, body?: string): Promise<string> {
  const url = body === undefined ? CH : `${CH}/?query=${encodeURIComponent(sql)}`;
  const res = await fetch(url, { method: "POST", body: body ?? sql });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickHouse ${res.status}: ${text.slice(0, 800)}`);
  }
  return text;
}

async function waitForClickHouse(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const text = await chQuery("SELECT 1");
      if (text.trim() === "1") {
        return;
      }
    } catch {
      await Bun.sleep(1000);
    }
  }
  throw new Error(`ClickHouse did not become ready at ${CH}`);
}

/** ClickHouse HTTP rejects multi-statement bodies; run each statement alone. */
async function execSqlFile(path: string): Promise<void> {
  const sql = await Bun.file(path).text();
  const statements = sql
    .split(";")
    .map((part) =>
      part
        .split("\n")
        .map((line) => {
          const comment = line.indexOf("--");
          return comment === -1 ? line : line.slice(0, comment);
        })
        .join("\n")
        .trim(),
    )
    .filter((part) => part.length > 0);
  for (const statement of statements) {
    await chQuery(statement);
  }
}

const truth: GroundTruth = {
  seed: SEED,
  people: PEOPLE,
  days: DAYS,
  start: new Date(START_MS).toISOString(),
  end: new Date(END_MS).toISOString(),
  incident: {
    start: new Date(INCIDENT_START).toISOString(),
    end: new Date(INCIDENT_END).toISOString(),
  },
  counts: {
    events: 0,
    pageviews: 0,
    signup: 0,
    trial_started: 0,
    checkout_completed: 0,
    invite_sent: 0,
    report_created: 0,
    subscription_cancelled: 0,
    error: 0,
    error_incident: 0,
  },
  funnel: { pricing: 0, trial_started: 0, checkout_completed: 0 },
  inviteWeek1: 0,
  twoDevicePeople: 0,
};

function bump(name: keyof GroundTruth["counts"], n = 1) {
  truth.counts[name] = (truth.counts[name] ?? 0) + n;
}

function makePerson(i: number) {
  const rng = rngFrom(`${SEED}:person:${i}`);
  const weeks = Math.max(1, Math.floor(DAYS / 7));
  const weekWeights: [number, number][] = Array.from({ length: weeks }, (_, w) => [
    w,
    1 + 0.03 * w,
  ]);
  const totalW = weekWeights.reduce((s, [, w]) => s + w, 0);
  const signupWeek = pickWeighted(
    rng,
    weekWeights.map(([w, weight]) => [w, weight / totalW]),
  );
  // Leave at least 14 days of life after signup when possible.
  const maxSignupDay = Math.max(0, DAYS - 14);
  const signupDay = Math.min(
    maxSignupDay,
    signupWeek * 7 + Math.floor(rng() * 7),
  );
  const hour = pickWeighted(rng, [
    [10, 0.15],
    [11, 0.15],
    [14, 0.15],
    [15, 0.12],
    [16, 0.1],
    [20, 0.1],
    [9, 0.08],
    [21, 0.08],
    [8, 0.07],
  ]);
  const signupAt =
    START_MS +
    signupDay * 86_400_000 +
    hour * 3_600_000 +
    Math.floor(rng() * 3_600_000);

  const profile = deviceProfile(rng);
  const twoDevices = rng() < 0.15;
  const persona = personaOf(rng);
  const sawPricing = rng() < 0.62;
  const startsTrial = sawPricing && rng() < 0.38;
  const checksOut = startsTrial && rng() < 0.3;
  const plan = pickWeighted<Plan>(rng, [
    ["starter", 0.5],
    ["pro", 0.35],
    ["business", 0.15],
  ]);
  const amount = { starter: 12, pro: 49, business: 199 }[plan];
  const inviteChance =
    persona === "power" ? 0.45 : persona === "regular" ? 0.18 : 0.06;
  const willInvite = rng() < inviteChance;

  if (twoDevices) {
    truth.twoDevicePeople += 1;
  }

  return {
    i,
    rng,
    distinctId: `user_${i}`,
    visitorIds: twoDevices ? [`vid_${i}_0`, `vid_${i}_1`] : [`vid_${i}_0`],
    signupAt,
    country: pickWeighted(rng, COUNTRIES),
    ...profile,
    persona,
    sawPricing,
    startsTrial,
    checksOut,
    plan,
    amount,
    willInvite,
    cancels: checksOut && rng() < 0.1,
  };
}

type Person = ReturnType<typeof makePerson>;

function emit(
  buffer: EventRow[],
  person: Person,
  at: number,
  sessionId: string,
  visitorId: string,
  identified: boolean,
  spec: {
    type: 1 | 2;
    name: string | null;
    path: string;
    sessionStart: boolean;
    data?: Record<string, string>;
  },
) {
  const utm = spec.sessionStart && person.rng() < 0.35;
  const row: EventRow = {
    website_id: WEBSITE_ID,
    session_id: sessionId,
    visit_id: sessionId,
    event_type: spec.type,
    event_name: spec.name,
    url_path: spec.path,
    hostname: HOSTNAME,
    referrer_domain: spec.sessionStart
      ? pick(person.rng, ["google.com", "twitter.com", "linkedin.com", "direct"])
      : null,
    referrer_path: spec.sessionStart ? "/" : null,
    utm_source: utm ? pick(person.rng, ["google", "twitter", "newsletter"]) : null,
    utm_medium: utm ? pick(person.rng, ["cpc", "social", "email"]) : null,
    utm_campaign: utm ? pick(person.rng, ["spring", "launch", "brand"]) : null,
    browser: person.browser,
    os: person.os,
    device: person.device,
    country: person.country,
    distinct_id: identified ? person.distinctId : null,
    visitor_id: visitorId,
    created_at: fmt(at),
    event_data: spec.data ?? {},
  };
  if (row.referrer_domain === "direct") {
    row.referrer_domain = null;
    row.referrer_path = null;
  }
  buffer.push(row);
  bump("events");
  if (spec.type === 1) {
    bump("pageviews");
  }
  if (spec.name && spec.name in truth.counts) {
    bump(spec.name as keyof GroundTruth["counts"]);
  }
  if (spec.name === "error" && at >= INCIDENT_START && at < INCIDENT_END) {
    bump("error_incident");
  }
}

function simulatePerson(person: Person, buffer: EventRow[]): void {
  const { rng } = person;
  let sessionSeq = 0;
  let lastTs = 0;
  let sessionId = "";
  let path = "/";

  const visitorAt = (identified: boolean) => {
    if (!identified || person.visitorIds.length === 1) {
      return person.visitorIds[0] ?? `vid_${person.i}_0`;
    }
    return person.visitorIds[rng() < 0.7 ? 0 : 1] ?? person.visitorIds[0];
  };

  const push = (
    at: number,
    spec: {
      type: 1 | 2;
      name: string | null;
      path: string;
      data?: Record<string, string>;
    },
    identified: boolean,
  ) => {
    const sessionStart = lastTs === 0 || at - lastTs > SESSION_GAP_MS;
    if (sessionStart) {
      sessionSeq += 1;
      sessionId = `s_${person.i}_${sessionSeq}`;
    }
    lastTs = at;
    emit(buffer, person, at, sessionId, visitorAt(identified), identified, {
      ...spec,
      sessionStart,
    });
    path = spec.path;
  };

  // Anonymous browsing before signup.
  const preDays = 1 + Math.floor(rng() * 10);
  let t = person.signupAt - preDays * 86_400_000 - Math.floor(rng() * 86_400_000);
  t = Math.max(START_MS, t);
  let sawPricing = false;
  const preCount = 2 + Math.floor(rng() * 6);
  for (let n = 0; n < preCount && t < person.signupAt - 60_000; n++) {
    path = n === 0 ? pick(rng, ["/", "/blog/launch", "/docs/start"]) : nextPage(rng, path);
    if (person.sawPricing && n === preCount - 2) {
      path = "/pricing";
    }
    if (path === "/pricing") {
      sawPricing = true;
    }
    push(t, { type: 1, name: null, path }, false);
    t += (2 + Math.floor(rng() * 12)) * 60_000;
  }
  if (person.sawPricing && !sawPricing) {
    push(person.signupAt - 5 * 60_000, { type: 1, name: null, path: "/pricing" }, false);
    sawPricing = true;
  }
  if (sawPricing) {
    truth.funnel.pricing += 1;
  }

  // Signup.
  push(person.signupAt - 30_000, { type: 1, name: null, path: "/signup" }, false);
  push(person.signupAt, { type: 2, name: "signup", path: "/signup" }, true);

  let trialAt: number | null = null;
  if (person.startsTrial) {
    const at =
      person.signupAt + (2 * 3_600_000 + Math.floor(rng() * 3 * 86_400_000));
    if (at < END_MS) {
      push(at, { type: 2, name: "trial_started", path: "/app" }, true);
      truth.funnel.trial_started += 1;
      trialAt = at;
    }
  }

  if (person.checksOut && trialAt !== null) {
    const delay = (1 + rng() * rng() * 14) * 86_400_000;
    const checkoutAt = trialAt + delay;
    if (checkoutAt < END_MS) {
      push(checkoutAt - 60_000, { type: 1, name: null, path: "/app/checkout" }, true);
      push(
        checkoutAt,
        {
          type: 2,
          name: "checkout_completed",
          path: "/app/checkout",
          data: { plan: person.plan, amount: String(person.amount) },
        },
        true,
      );
      truth.funnel.checkout_completed += 1;
    }
  }

  if (person.willInvite) {
    const inviteAt = person.signupAt + (2 + rng() * 5) * 3_600_000;
    if (inviteAt < person.signupAt + 7 * 86_400_000 && inviteAt < END_MS) {
      push(inviteAt, { type: 2, name: "invite_sent", path: "/app/settings" }, true);
      truth.inviteWeek1 += 1;
      if (rng() < 0.4) {
        push(
          inviteAt + 3_600_000,
          { type: 2, name: "invite_sent", path: "/app/settings" },
          true,
        );
      }
    }
  }

  // Ongoing activity.
  const signupDay = Math.floor((person.signupAt - START_MS) / 86_400_000);
  for (let day = signupDay; day < DAYS; day++) {
    const dayStart = START_MS + day * 86_400_000;
    if (dayStart <= person.signupAt) {
      continue;
    }
    const weekFromSignup = Math.floor((dayStart - person.signupAt) / (7 * 86_400_000));
    const chance = dailyActiveChance(person.persona, weekFromSignup, person.willInvite);
    if (rng() > chance) {
      if (person.persona === "churned" && weekFromSignup >= 2) {
        break;
      }
      continue;
    }
    const nEvents = eventsOnActiveDay(person.persona, rng);
    let at = dayStart + (9 + Math.floor(rng() * 10)) * 3_600_000 + Math.floor(rng() * 3_600_000);
    path = "/app";
    for (let e = 0; e < nEvents && at < END_MS; e++) {
      path = nextPage(rng, path.startsWith("/app") ? path : "/app");
      push(at, { type: 1, name: null, path }, true);
      if (path === "/app/reports" && rng() < (person.persona === "power" ? 0.35 : 0.12)) {
        at += 20_000 + Math.floor(rng() * 40_000);
        push(at, { type: 2, name: "report_created", path: "/app/reports" }, true);
      }
      const errorRate =
        at >= INCIDENT_START && at < INCIDENT_END && path === "/app/checkout"
          ? 0.18
          : 0.004;
      if (rng() < errorRate) {
        at += 5_000;
        push(at, { type: 2, name: "error", path, data: { code: "checkout_failed" } }, true);
      }
      at += (1 + Math.floor(rng() * 8)) * 60_000;
    }
  }

  if (person.cancels) {
    const cancelAt = person.signupAt + (14 + rng() * 50) * 86_400_000;
    if (cancelAt < END_MS) {
      push(cancelAt, { type: 2, name: "subscription_cancelled", path: "/app/settings" }, true);
    }
  }
}

async function flush(buffer: EventRow[]): Promise<void> {
  if (buffer.length === 0) {
    return;
  }
  const body = buffer.map((row) => JSON.stringify(row)).join("\n");
  await chQuery("INSERT INTO product_analytics.pa_events FORMAT JSONEachRow", body);
  buffer.length = 0;
}

async function main() {
  if (!Number.isFinite(PEOPLE) || PEOPLE < 1) {
    throw new Error(`Invalid PA_PEOPLE: ${process.env.PA_PEOPLE}`);
  }
  console.log(`Waiting for ClickHouse at ${CH}`);
  await waitForClickHouse();
  await execSqlFile(`${import.meta.dir}/sql/01_pa_events.sql`);
  await chQuery("TRUNCATE TABLE IF EXISTS product_analytics.pa_events");
  console.log(`Generating ${PEOPLE} people over ${DAYS} days, seed=${SEED}`);

  const buffer: EventRow[] = [];
  const t0 = performance.now();
  for (let i = 0; i < PEOPLE; i++) {
    simulatePerson(makePerson(i), buffer);
    if (buffer.length >= BATCH) {
      await flush(buffer);
    }
    if ((i + 1) % 2500 === 0) {
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${PEOPLE} people, ${truth.counts.events} events, ${elapsed}s`);
    }
  }
  await flush(buffer);

  console.log("Building pa_events_resolved");
  await execSqlFile(`${import.meta.dir}/sql/02_pa_events_resolved.sql`);

  const out = `${import.meta.dir}/ground-truth.json`;
  await Bun.write(out, JSON.stringify(truth, null, 2) + "\n");
  console.log(`Wrote ${truth.counts.events} events. Ground truth → ${out}`);
  console.log(
    `Funnel people: pricing=${truth.funnel.pricing} trial=${truth.funnel.trial_started} checkout=${truth.funnel.checkout_completed}`,
  );
}

await main();
