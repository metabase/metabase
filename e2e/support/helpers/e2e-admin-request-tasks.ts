import {
  BACKEND_HOST,
  BACKEND_PORT,
} from "../../runner/constants/backend-port";
import { USERS } from "../cypress_data";

const BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

type AdminRequest = {
  method?: string;
  url: string;
  body?: unknown;
};

async function send(url: string, init: RequestInit) {
  const response = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${init.method} ${url} → ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function cachedAdminSession(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require for optional file
    const { loginCache } = require("../cypress_sample_instance_data.json");
    return loginCache?.admin?.sessionId;
  } catch {
    return undefined;
  }
}

async function freshAdminSession(): Promise<string | undefined> {
  const { email: username, password } = USERS.admin;
  const { id } = await send("/api/session", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return id;
}

/**
  Acts as the admin without touching the browser's cookies
 */
export async function requestAsAdmin({
  method = "GET",
  url,
  body,
}: AdminRequest) {
  const sessionId = cachedAdminSession() ?? (await freshAdminSession());

  if (!sessionId) {
    throw new Error("Could not resolve an admin session");
  }

  return send(url, {
    method,
    headers: { "X-Metabase-Session": sessionId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
