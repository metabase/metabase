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

export type BackendRequest = AdminRequest & {
  /** Sent as `X-Metabase-Session`; omit to make the request unauthenticated */
  sessionId?: string;
  /** Like `cy.request`: when false, a non-2xx status is returned rather than thrown */
  failOnStatusCode?: boolean;
};

export type BackendResponse<TBody = unknown> = {
  status: number;
  body: TBody;
  /** The `Set-Cookie` cookies of the response, by name */
  cookies: Record<string, string>;
};

function parseBody(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function parseCookies(headers: Headers) {
  return Object.fromEntries(
    headers.getSetCookie().map((cookie) => {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      return [pair.slice(0, separator), pair.slice(separator + 1)];
    }),
  );
}

/**
  Makes a request from Node rather than the browser, so it neither reads nor
  changes the browser's cookies. Redirects are not followed.
 */
export async function backendRequest<TBody = unknown>({
  method = "GET",
  url,
  body,
  sessionId,
  failOnStatusCode = true,
}: BackendRequest): Promise<BackendResponse<TBody>> {
  const response = await fetch(`${BASE_URL}${url}`, {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      ...(sessionId ? { "X-Metabase-Session": sessionId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();

  if (failOnStatusCode && !response.ok) {
    throw new Error(`${method} ${url} → ${response.status}: ${text}`);
  }
  return {
    status: response.status,
    body: parseBody(text),
    cookies: parseCookies(response.headers),
  };
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
  const { body } = await backendRequest<{ id?: string } | null>({
    method: "POST",
    url: "/api/session",
    body: { username, password },
  });
  return body?.id;
}

/**
  Acts as the admin without touching the browser's cookies
 */
export async function requestAsAdmin(request: AdminRequest) {
  const sessionId = cachedAdminSession() ?? (await freshAdminSession());

  if (!sessionId) {
    throw new Error("Could not resolve an admin session");
  }

  const { body } = await backendRequest({ ...request, sessionId });
  return body;
}
