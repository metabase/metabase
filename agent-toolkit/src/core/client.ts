import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./api-types.js";
import { type AuthConfig, getAuthHeaders } from "./auth.js";
import { CliError } from "./validation.js";

export interface ClientConfig {
  baseUrl: string;
  auth: AuthConfig;
}

/**
 * Typed API client. We use openapi-fetch for path/method safety,
 * but relax params with `as any` since the generated spec marks many
 * optional query params as required (a quirk of Metabase's spec generation).
 *
 * All methods return `{ data }` where data is cast to the expected type.
 */
export interface MetabaseClient {
  GET: (path: string, opts?: { params?: Record<string, unknown> }) => Promise<{ data: unknown }>;
  POST: (path: string, opts?: { params?: Record<string, unknown>; body?: unknown }) => Promise<{ data: unknown }>;
  PUT: (path: string, opts?: { params?: Record<string, unknown>; body?: unknown }) => Promise<{ data: unknown }>;
  DELETE: (path: string, opts?: { params?: Record<string, unknown> }) => Promise<{ data: unknown }>;
}

export function createMetabaseClient(config: ClientConfig): MetabaseClient {
  const authHeaders = getAuthHeaders(config.auth);

  const errorMiddleware: Middleware = {
    async onResponse({ response }) {
      if (!response.ok && response.status !== 202) {
        let message: string;
        try {
          const body = await response.clone().json();
          message =
            typeof body === "object" && body !== null && "message" in body
              ? String(body.message)
              : JSON.stringify(body);
        } catch {
          message = `HTTP ${response.status}`;
        }
        throw new CliError("api_error", {
          message,
          details: { status: response.status },
        });
      }
      return response;
    },
  };

  const inner = createClient<paths>({
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
  });

  inner.use(errorMiddleware);

  // Wrap to relax strict param requirements and handle undefined data
  const wrap = (method: "GET" | "POST" | "PUT" | "DELETE") =>
    async (path: string, opts?: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (inner as any)[method](path, opts);
      if (result.error && !result.data) {
        throw new CliError("api_error", {
          message: typeof result.error === "object" && result.error?.message
            ? String(result.error.message)
            : JSON.stringify(result.error),
        });
      }
      return { data: result.data };
    };

  return {
    GET: wrap("GET"),
    POST: wrap("POST"),
    PUT: wrap("PUT"),
    DELETE: wrap("DELETE"),
  };
}
