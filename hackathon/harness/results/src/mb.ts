/**
 * Minimal Metabase REST client for the results package's scripts (dashboard build, serdes).
 *
 *   MB_URL       default: http://localhost:<local/.port>, else :3002
 *   MB_USER      default: dev@metabase.local
 *   MB_PASSWORD  default: devdev1234   (the local dev instance's login, see agents/_shared-context.md)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function defaultUrl(): string {
  try {
    return `http://localhost:${readFileSync(join(ROOT, "local", ".port"), "utf8").trim()}`;
  } catch {
    return "http://localhost:3002";
  }
}

export const MB_URL = process.env.MB_URL ?? defaultUrl();

/** A logged-in session. `request` throws on any non-2xx with the method, path and (truncated) body. */
export type Mb = {
  request: (method: string, path: string, init?: { body?: unknown; headers?: Record<string, string> }) => Promise<Response>;
  json: <T = any>(method: string, path: string, body?: unknown) => Promise<T>;
};

export async function login(): Promise<Mb> {
  const request: Mb["request"] = async (method, path, { body, headers = {} } = {}) => {
    const isForm = body instanceof FormData;
    const res = await fetch(MB_URL + path, {
      method,
      headers: { ...(body === undefined || isForm ? {} : { "Content-Type": "application/json" }), ...auth, ...headers },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 2000)}`);
    }
    return res;
  };
  let auth: Record<string, string> = {};
  const { id } = await (await request("POST", "/api/session", {
    body: { username: process.env.MB_USER ?? "dev@metabase.local", password: process.env.MB_PASSWORD ?? "devdev1234" },
  })).json();
  auth = { "X-Metabase-Session": id };
  return {
    request,
    json: async (method, path, body) => {
      const text = await (await request(method, path, { body })).text();
      return text ? JSON.parse(text) : null;
    },
  };
}

