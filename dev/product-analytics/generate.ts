/**
 * Seeded SaaS event simulator → product_analytics.pa_events and
 * pa_identities (with pa_identity_history alongside), then the *_resolved
 * tables Metabase queries.
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
// Signups simulated after the data ends, whose earlier browsing is in range.
const LEAD_WEEKS = 2;

type Persona = "power" | "regular" | "casual" | "churned";
type Plan = "starter" | "pro" | "business";
type TrialSource = "pricing_page" | "onboarding" | "sales_email";
type BillingCycle = "monthly" | "annual";

/** Matches Track's pa_identities: session_id is the identify() id. */
type IdentityRow = {
  website_id: string;
  session_id: string;
  identity_data: Record<string, string>;
  ip: string;
  created_at: string;
};

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
  /** People with at least one identify() call, so one pa_identities_resolved row each. */
  identifiedPeople: number;
  insights: PlantedInsights;
};

/** A funnel transition, named by its steps in `check.ts`'s funnel spec. */
type Transition = "Viewed pricing → Started trial" | "Started trial → Purchased";

/** What the insight search should and shouldn't find; see `check-insights.ts`. */
type PlantedInsights = {
  expected: {
    transition: Transition;
    /** Any of these. Different conditions can describe the same people. */
    conditions: Record<string, string>[];
    direction: "higher" | "lower";
    why: string;
  }[];
  unexpected: {
    transition: Transition;
    column: string;
    /** Any value of the column when absent. */
    value?: string;
    why: string;
  }[];
};

// Conversion multipliers the generator applies. Everything else about a
// person is independent of whether they convert.
const IOS_CHECKOUT = 0.5;
const ANDROID_FIREFOX_TRIAL = 0.25;
const SALES_EMAIL_CHECKOUT = 1.8;
const NZ_TRIAL = 2.4;
const ADMIN_CHECKOUT = 1.6;

const PLANTED_INSIGHTS: PlantedInsights = {
  expected: [
    {
      transition: "Started trial → Purchased",
      conditions: [{ os: "iOS" }],
      direction: "lower",
      why: `iOS checkout conversion × ${IOS_CHECKOUT}. iOS always means Safari, so this should not also show as Safari, or Safari and iOS.`,
    },
    {
      transition: "Viewed pricing → Started trial",
      // Mobile Firefox is always Android.
      conditions: [
        { browser: "Firefox", os: "Android" },
        { browser: "Firefox", device: "mobile" },
      ],
      direction: "lower",
      why: `Android + Firefox trial starts × ${ANDROID_FIREFOX_TRIAL}. Android or Firefox alone should be explained by the pair.`,
    },
    {
      transition: "Started trial → Purchased",
      conditions: [{ trial_source: "sales_email" }],
      direction: "higher",
      why: `Checkout × ${SALES_EMAIL_CHECKOUT}. trial_source is only set on trial_started events, so this tests sparse columns.`,
    },
    {
      transition: "Started trial → Purchased",
      conditions: [{ person_role: "admin" }],
      direction: "higher",
      why: `Admin checkout × ${ADMIN_CHECKOUT}. person_role comes from identify(), copied onto events as of each event.`,
    },
  ],
  unexpected: [
    {
      transition: "Started trial → Purchased",
      column: "plan",
      why: "plan is only set on checkout_completed, so it isn't known when someone starts a trial.",
    },
    {
      transition: "Viewed pricing → Started trial",
      column: "country",
      value: "NZ",
      why: `NZ trial starts × ${NZ_TRIAL}, but NZ is too small to report.`,
    },
    {
      transition: "Started trial → Purchased",
      column: "person_billing_cycle",
      why: "Only the identify() at checkout sets billing_cycle, so it isn't known when someone starts a trial.",
    },
    {
      transition: "Started trial → Purchased",
      column: "person_plan",
      why: "The plan trait follows the funnel (free, trial, then the plan bought), so its value as of an event can't predict a later step.",
    },
  ],
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
  // Too few people to report, however strong their effect.
  ["NZ", 0.002],
];

const FIRST_NAMES = [
  "Ada", "Ben", "Chloe", "Dev", "Elena", "Femi", "Grace", "Hugo", "Iris", "Jonas",
  "Kai", "Lena", "Mateo", "Nia", "Omar", "Priya", "Quinn", "Rosa", "Sam", "Tomas",
  "Uma", "Viktor", "Wren", "Ximena", "Yusuf", "Zoe",
];

const LAST_NAMES = [
  "Adeyemi", "Brown", "Chen", "Dubois", "Evans", "Fischer", "Garcia", "Haddad",
  "Ivanova", "Johansson", "Kim", "Lopez", "Mori", "Nguyen", "Okafor", "Patel",
  "Quintero", "Rossi", "Silva", "Tanaka", "Ueda", "Varga", "Walsh", "Xu", "Yilmaz", "Zhang",
];

/** Weights skew toward a few large accounts so company breakdowns have a head and a tail. */
const COMPANIES: [string, number][] = [
  ["Acme Corp", 0.12],
  ["Globex", 0.1],
  ["Initech", 0.09],
  ["Umbrella Co", 0.08],
  ["Hooli", 0.07],
  ["Vandelay Industries", 0.06],
  ["Stark Industries", 0.06],
  ["Wayne Enterprises", 0.05],
  ["Wonka Inc", 0.05],
  ["Dunder Mifflin", 0.05],
  ["Pied Piper", 0.04],
  ["Soylent", 0.04],
  ["Cyberdyne", 0.04],
  ["Tyrell Corp", 0.03],
  ["Aperture Labs", 0.03],
  ["Massive Dynamic", 0.03],
  ["Gringotts", 0.02],
  ["Oscorp", 0.02],
  ["Sirius Cybernetics", 0.01],
  ["Monsters Inc", 0.01],
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
  // Strip comments before splitting so a semicolon in a comment is harmless.
  const statements = sql
    .split("\n")
    .map((line) => {
      const comment = line.indexOf("--");
      return comment === -1 ? line : line.slice(0, comment);
    })
    .join("\n")
    .split(";")
    .map((part) => part.trim())
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
    identities: 0,
  },
  funnel: { pricing: 0, trial_started: 0, checkout_completed: 0 },
  inviteWeek1: 0,
  twoDevicePeople: 0,
  identifiedPeople: 0,
  insights: PLANTED_INSIGHTS,
};

function bump(name: keyof GroundTruth["counts"], n = 1) {
  truth.counts[name] = (truth.counts[name] ?? 0) + n;
}

function makePerson(i: number) {
  const rng = rngFrom(`${SEED}:person:${i}`);
  const weeks = Math.max(1, Math.floor(DAYS / 7)) + LEAD_WEEKS;
  const weekWeights: [number, number][] = Array.from({ length: weeks }, (_, w) => [
    w,
    1 + 0.03 * w,
  ]);
  const totalW = weekWeights.reduce((s, [, w]) => s + w, 0);
  const signupWeek = pickWeighted(
    rng,
    weekWeights.map(([w, weight]) => [w, weight / totalW]),
  );
  // Signups run past the end of the data, so recent activity is cut off the
  // way it is in real data. Clamping instead piles the last weeks' signups
  // onto a single day.
  const signupDay = signupWeek * 7 + Math.floor(rng() * 7);
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
  const country = pickWeighted(rng, COUNTRIES);
  const twoDevices = rng() < 0.15;
  const persona = personaOf(rng);
  // Separate stream so adding traits leaves the event data unchanged. Draw
  // new traits last so existing ones keep their values.
  const traitRng = rngFrom(`${SEED}:traits:${i}`);
  const firstName = pick(traitRng, FIRST_NAMES);
  const lastName = pick(traitRng, LAST_NAMES);
  const company = pickWeighted(traitRng, COMPANIES);
  const domain = `${company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`;
  const role: string = pickWeighted(traitRng, [
    ["admin", persona === "power" ? 0.5 : 0.15],
    ["editor", 0.45],
    ["viewer", persona === "power" ? 0.05 : 0.4],
  ]);
  const billingCycle = pickWeighted<BillingCycle>(traitRng, [
    ["monthly", 0.7],
    ["annual", 0.3],
  ]);
  const trialSource = pickWeighted<TrialSource>(rng, [
    ["pricing_page", 0.5],
    ["onboarding", 0.35],
    ["sales_email", 0.15],
  ]);
  const trialChance =
    0.38 *
    (profile.os === "Android" && profile.browser === "Firefox"
      ? ANDROID_FIREFOX_TRIAL
      : 1) *
    (country === "NZ" ? NZ_TRIAL : 1);
  const checkoutChance =
    0.3 *
    (profile.os === "iOS" ? IOS_CHECKOUT : 1) *
    (trialSource === "sales_email" ? SALES_EMAIL_CHECKOUT : 1) *
    (role === "admin" ? ADMIN_CHECKOUT : 1);
  const sawPricing = rng() < 0.62;
  const startsTrial = sawPricing && rng() < trialChance;
  const checksOut = startsTrial && rng() < checkoutChance;
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
    traits: {
      email: `${firstName}.${lastName}${i}@${domain}`.toLowerCase(),
      name: `${firstName} ${lastName}`,
      company,
      role,
    },
    visitorIds: twoDevices ? [`vid_${i}_0`, `vid_${i}_1`] : [`vid_${i}_0`],
    signupAt,
    country,
    ...profile,
    persona,
    sawPricing,
    startsTrial,
    checksOut,
    plan,
    amount,
    billingCycle,
    trialSource,
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

/**
 * One identify() call, the way Track stores it: session_id is the identify()
 * id, and the whole trait map is sent every time, so later rows replace
 * earlier ones once ReplacingMergeTree merges. ip is '' without consent.
 * `account` holds the traits that change as the person moves through the funnel.
 */
function identify(
  identities: IdentityRow[],
  person: Person,
  at: number,
  account: Record<string, string>,
) {
  identities.push({
    website_id: WEBSITE_ID,
    session_id: person.distinctId,
    identity_data: {
      ...person.traits,
      ...account,
      signed_up_at: fmt(person.signupAt),
    },
    ip: "",
    created_at: fmt(at),
  });
  bump("identities");
}

function simulatePerson(
  person: Person,
  buffer: EventRow[],
  identities: IdentityRow[],
): void {
  const { rng } = person;
  let sessionSeq = 0;
  let lastTs = 0;
  let sessionId = "";
  let path = "/";
  const account: Record<string, string> = { plan: "free" };

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
  ): boolean => {
    // People who sign up after the data ends still browse before it ends.
    if (at >= END_MS) {
      return false;
    }
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
    return true;
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
    if (push(t, { type: 1, name: null, path }, false) && path === "/pricing") {
      sawPricing = true;
    }
    t += (2 + Math.floor(rng() * 12)) * 60_000;
  }
  if (person.sawPricing && !sawPricing) {
    sawPricing = push(
      person.signupAt - 5 * 60_000,
      { type: 1, name: null, path: "/pricing" },
      false,
    );
  }
  if (sawPricing) {
    truth.funnel.pricing += 1;
  }

  // Signup.
  push(person.signupAt - 30_000, { type: 1, name: null, path: "/signup" }, false);
  if (push(person.signupAt, { type: 2, name: "signup", path: "/signup" }, true)) {
    identify(identities, person, person.signupAt, account);
    truth.identifiedPeople += 1;
  }

  let trialAt: number | null = null;
  if (person.startsTrial) {
    const at =
      person.signupAt + (2 * 3_600_000 + Math.floor(rng() * 3 * 86_400_000));
    if (at < END_MS) {
      push(
        at,
        {
          type: 2,
          name: "trial_started",
          path: "/app",
          data: { trial_source: person.trialSource },
        },
        true,
      );
      account.plan = "trial";
      identify(identities, person, at, account);
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
      account.plan = person.plan;
      account.billing_cycle = person.billingCycle;
      identify(identities, person, checkoutAt, account);
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
      account.plan = "cancelled";
      identify(identities, person, cancelAt, account);
    }
  }
}

async function flush(table: string, buffer: object[]): Promise<void> {
  if (buffer.length === 0) {
    return;
  }
  const body = buffer.map((row) => JSON.stringify(row)).join("\n");
  await chQuery(`INSERT INTO product_analytics.${table} FORMAT JSONEachRow`, body);
  buffer.length = 0;
}

async function main() {
  if (!Number.isFinite(PEOPLE) || PEOPLE < 1) {
    throw new Error(`Invalid PA_PEOPLE: ${process.env.PA_PEOPLE}`);
  }
  console.log(`Waiting for ClickHouse at ${CH}`);
  await waitForClickHouse();
  await execSqlFile(`${import.meta.dir}/sql/01_pa_events.sql`);
  await execSqlFile(`${import.meta.dir}/sql/02_pa_identities.sql`);
  // Before any insert, so the history sees every identify().
  await execSqlFile(`${import.meta.dir}/sql/03_pa_identity_history.sql`);
  await chQuery("TRUNCATE TABLE IF EXISTS product_analytics.pa_events");
  await chQuery("TRUNCATE TABLE IF EXISTS product_analytics.pa_identities");
  await chQuery("TRUNCATE TABLE IF EXISTS product_analytics.pa_identity_history");
  console.log(`Generating ${PEOPLE} people over ${DAYS} days, seed=${SEED}`);

  const buffer: EventRow[] = [];
  const identities: IdentityRow[] = [];
  const t0 = performance.now();
  for (let i = 0; i < PEOPLE; i++) {
    simulatePerson(makePerson(i), buffer, identities);
    if (buffer.length >= BATCH) {
      await flush("pa_events", buffer);
    }
    if (identities.length >= BATCH) {
      await flush("pa_identities", identities);
    }
    if ((i + 1) % 2500 === 0) {
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${PEOPLE} people, ${truth.counts.events} events, ${elapsed}s`);
    }
  }
  await flush("pa_events", buffer);
  await flush("pa_identities", identities);

  console.log("Building pa_events_resolved");
  await execSqlFile(`${import.meta.dir}/sql/04_pa_events_resolved.sql`);
  console.log("Building pa_identities_resolved");
  await execSqlFile(`${import.meta.dir}/sql/05_pa_identities_resolved.sql`);

  const out = `${import.meta.dir}/ground-truth.json`;
  await Bun.write(out, JSON.stringify(truth, null, 2) + "\n");
  console.log(
    `Wrote ${truth.counts.events} events and ${truth.counts.identities} identities for ${truth.identifiedPeople} people. Ground truth → ${out}`,
  );
  console.log(
    `Funnel people: pricing=${truth.funnel.pricing} trial=${truth.funnel.trial_started} checkout=${truth.funnel.checkout_completed}`,
  );
}

await main();
