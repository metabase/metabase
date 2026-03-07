/**
 * Typed API client. We use openapi-fetch for path/method safety,
 * but relax params with `as any` since the generated spec marks many
 * optional query params as required (a quirk of Metabase's spec generation).
 *
 * All methods return `{ data }` where data is cast to the expected type.
 */
interface MetabaseClient {
    GET: (path: string, opts?: {
        params?: Record<string, unknown>;
    }) => Promise<{
        data: unknown;
    }>;
    POST: (path: string, opts?: {
        params?: Record<string, unknown>;
        body?: unknown;
    }) => Promise<{
        data: unknown;
    }>;
    PUT: (path: string, opts?: {
        params?: Record<string, unknown>;
        body?: unknown;
    }) => Promise<{
        data: unknown;
    }>;
    DELETE: (path: string, opts?: {
        params?: Record<string, unknown>;
    }) => Promise<{
        data: unknown;
    }>;
}

interface OutputOptions {
    fields?: string[];
    maxRows?: number;
}

interface GlobalContext {
    client: MetabaseClient;
    outputOpts: OutputOptions;
    dryRun: boolean;
}

export type { GlobalContext };
