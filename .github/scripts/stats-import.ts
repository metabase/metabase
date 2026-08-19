// Pushes stats rows to eng-stats-importer, which writes them to Postgres.
//
// The importer's origin comes from ENG_STATS_URL and its key from API_KEY, both
// repository secrets — this repo is public, so neither is hardcoded here. Visit
// the importer to see the tables and mint keys.

// Transient failures worth retrying: throttling and server-side errors. A 4xx
// (bad request, auth, unknown table) won't succeed on retry, so those fail fast.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * One row, keyed by column. Values are `unknown` rather than a scalar union
 * because a `json` column takes arbitrary nested data.
 */
export type StatsRow = Record<string, unknown>;

export interface ImportStatsOptions {
  /** Table name as it appears in `/api/import/{table}`, e.g. `emotion_files`. */
  table: string;
  rows: StatsRow[];
  /** Importer origin. Defaults to ENG_STATS_URL. */
  baseUrl?: string;
  /** Extra attempts after the first, so the default 2 means up to 3 tries. */
  retries?: number;
  retryDelayMs?: number;
  /** Per-attempt total deadline; aborts a stalled request. */
  timeoutMs?: number;
}

export interface ImportStatsResult {
  success: true;
  inserted?: number;
  /** Payload keys with no matching column, when `ignoreUnknown` is in play. */
  ignoredKeys?: string[];
}

class ImportError extends Error {
  retryable: boolean;

  constructor(message: string, { retryable }: { retryable: boolean }) {
    super(message);
    this.retryable = retryable;
  }
}

async function attemptImport(
  url: string,
  rows: StatsRow[],
  timeoutMs: number,
): Promise<ImportStatsResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: {
        "x-api-key": process.env.API_KEY ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify(rows),
      // Without this the request can hang indefinitely on a stalled server,
      // eating the whole job timeout. An abort surfaces below as a retryable
      // network error, so it retries with backoff instead.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (networkError) {
    const message =
      networkError instanceof Error ? networkError.message : String(networkError);
    throw new ImportError(message, { retryable: true });
  }

  if (!response.ok) {
    // Failures carry an `{ error }` body naming the offending row and column,
    // which is the only way to tell a type mismatch from a typo'd key.
    const body = await response.text().catch(() => "");
    throw new ImportError(
      `Import failed: ${response.status} ${response.statusText} ${body}`.trim(),
      { retryable: RETRYABLE_STATUS.has(response.status) },
    );
  }

  // Best-effort: the row count is for logging, so a body that doesn't parse
  // shouldn't turn a successful import into a failure.
  const result = (await response.json().catch(() => ({}))) as {
    inserted?: number;
    ignoredKeys?: string[];
  };
  return { success: true, inserted: result.inserted, ignoredKeys: result.ignoredKeys };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Imports `rows` into the `table` table, retrying transient API errors with
 * exponential backoff.
 *
 * Keys are matched leniently against the table's columns -- `Emotion Files`,
 * `emotionFiles` and `emotion_files` all land in `emotion_files` -- but values
 * are matched strictly, and a key matching no column is an error rather than a
 * silent drop. Rows are appended; the importer has no replace mode.
 *
 * Throws the last error once attempts are exhausted or the error is
 * non-retryable.
 */
export async function importStats({
  table,
  rows,
  baseUrl = process.env.ENG_STATS_URL,
  retries = 2,
  retryDelayMs = 1000,
  timeoutMs = 60_000,
}: ImportStatsOptions): Promise<ImportStatsResult> {
  // The importer accepts an empty payload, but there's no point spending a
  // request (and a rate-limit slot) to insert nothing.
  if (rows.length === 0) {
    return { success: true, inserted: 0 };
  }

  if (!baseUrl) {
    throw new Error("ENG_STATS_URL is not set, so there is no importer to push to");
  }

  // Tolerate a trailing slash: the origin comes from a hand-entered secret.
  const url = `${baseUrl.replace(/\/+$/, "")}/api/import/${table}`;

  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptImport(url, rows, timeoutMs);
    } catch (error) {
      const importError = error as ImportError;
      if (!importError.retryable || attempt >= retries) {
        throw error;
      }
      const delay = retryDelayMs * 2 ** attempt;
      console.warn(
        `Import attempt ${attempt + 1} failed (${importError.message}); retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
}
