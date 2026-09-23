/**
 * The §2 search adapter: `GET /api/search?search_engine=…` against a running instance.
 *
 * Adapters never time themselves; the runner does.
 */
import type { Scenario } from "../../results/src/writer.ts";

import type { Credentials } from "./config.ts";

export type SearchResult = { model: string; id: number; name: string; score: number; allScores: unknown[] };

export type QueryOutcome = { results: SearchResult[]; rawCount: null; error: string | null };

export interface SearchAdapter {
  id: string;
  ready(): Promise<{ ready: boolean; reason: string }>;
  describe(): Promise<{ engine: string; embedder: string; dimensions: number | null; indexSize: number | null }>;
  runQuery(scenario: Scenario, opts: { models?: string[]; limit?: number }): Promise<QueryOutcome>;
}

type Params = Record<string, string | number | string[] | undefined>;

/** A logged-in Metabase API session. Logs in lazily, once. */
export class MetabaseSession {
  readonly baseUrl: string;
  private readonly creds: Credentials;
  private session: Promise<string> | undefined;

  constructor(baseUrl: string, creds: Credentials) {
    this.baseUrl = baseUrl;
    this.creds = creds;
  }

  private login(): Promise<string> {
    this.session ??= (async () => {
      const res = await fetch(`${this.baseUrl}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.creds),
      });
      if (!res.ok) throw new Error(`login as ${this.creds.username} failed: HTTP ${res.status} ${await res.text()}`);
      return ((await res.json()) as { id: string }).id;
    })();
    return this.session;
  }

  /** Raw request. Never throws on HTTP status; `body` is parsed JSON when possible, else text. */
  async request(method: string, path: string, opts: { params?: Params; body?: unknown } = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      if (v === undefined) continue;
      for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(item));
    }
    const res = await fetch(url, {
      method,
      headers: {
        "X-Metabase-Session": await this.login(),
        ...(opts.body !== undefined && { "Content-Type": "application/json" }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON; keep the text
    }
    return { status: res.status, body };
  }

  /** GET that throws on a non-2xx status. */
  async get<T = any>(path: string, params?: Params): Promise<T> {
    const { status, body } = await this.request("GET", path, { params });
    if (status < 200 || status >= 300) throw new Error(`GET ${path}: HTTP ${status} ${JSON.stringify(body)}`);
    return body as T;
  }
}

/**
 * Embedder the instance is configured with. `ee-embedding-*` session properties are only visible to admins, so
 * pass an admin session; a non-admin one would read "none".
 */
export async function configuredEmbedder(adminSession: MetabaseSession) {
  const props = await adminSession.get<Record<string, unknown>>("/api/session/properties");
  const provider = props["ee-embedding-provider"] ?? null;
  const model = props["ee-embedding-model"] ?? null;
  // BL-33: a query prefix changes what is embedded at search time, so it is part of the embedder's identity.
  const prefix = props["ee-embedding-query-prefix"];
  const queryPrefix = typeof prefix === "string" && prefix !== "" ? prefix : null;
  return {
    embedder: provider && model ? `${provider}/${model}${queryPrefix === null ? "" : "+qprefix"}` : "none",
    dimensions: (props["ee-embedding-model-dimensions"] as number | null) ?? null,
    queryPrefix,
  };
}

/** `/api/search` drops the total score and keeps only per-scorer contributions; the total is their sum. */
function toResult(row: any): SearchResult {
  const scores: any[] = row.scores ?? [];
  return {
    model: row.model,
    id: row.id,
    name: row.name,
    score: scores.reduce((sum, s) => sum + (typeof s.contribution === "number" ? s.contribution : 0), 0),
    allScores: scores,
  };
}

/** Response `engine` is "search.engine/appdb"; compare on the bare name. */
const bareEngine = (e: unknown) => String(e ?? "").replace(/^search\.engine\//, "");

/**
 * `session` is the non-superuser every query runs as. `adminSession` is only read for provenance (the configured
 * embedder is admin-visible); it never serves a timed query.
 */
export function httpAdapter(engine: string, session: MetabaseSession, adminSession: MetabaseSession): SearchAdapter {
  return {
    id: engine,

    async ready() {
      try {
        const { status, body } = await session.request("GET", "/api/search", {
          params: { q: "harness-ready-probe", search_engine: engine, limit: 1 },
        });
        if (status !== 200) return { ready: false, reason: `HTTP ${status}: ${body?.message ?? JSON.stringify(body)}` };
        if (bareEngine(body.engine) !== engine) return { ready: false, reason: `served by ${bareEngine(body.engine)}` };
        return { ready: true, reason: "ok" };
      } catch (e) {
        return { ready: false, reason: `unreachable: ${(e as Error).message}` };
      }
    },

    async describe() {
      return { engine, ...(await configuredEmbedder(adminSession)), indexSize: null };
    },

    async runQuery(scenario, { models, limit }) {
      try {
        const { status, body } = await session.request("GET", "/api/search", {
          params: { q: scenario.query, search_engine: engine, limit, models: models?.length ? [...models].sort() : undefined },
        });
        if (status !== 200) {
          return { results: [], rawCount: null, error: `HTTP ${status}: ${body?.message ?? JSON.stringify(body)}` };
        }
        // Metabase falls back to other engines silently in several places; never report one engine's rows as another's.
        if (bareEngine(body.engine) !== engine) {
          return { results: [], rawCount: null, error: `requested ${engine} but response came from ${bareEngine(body.engine)}` };
        }
        return { results: (body.data as unknown[]).map(toResult), rawCount: null, error: null };
      } catch (e) {
        return { results: [], rawCount: null, error: (e as Error).message };
      }
    },
  };
}
