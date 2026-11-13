/* eslint-disable metabase/no-literal-metabase-strings -- request header name */
import type { OnBeforeRequestHandler } from "metabase/api/client";

import type { PrincipalType } from "./api";

const STORAGE_KEY = "metabase.permissionPreview";

const URL_PARAMS = {
  userId: "preview_as_user",
  userName: "preview_as_user_name",
  principalType: "preview_as_principal_type",
  principalId: "preview_as_principal_id",
  principalName: "preview_as_principal",
  attributes: "preview_as_attributes",
  returnPath: "preview_return",
};

export type PreviewState = {
  userId: number;
  userName: string;
  principalType: PrincipalType;
  principalId: number;
  principalName: string;
  /** The attribute values a group preview runs with. */
  attributes: Record<string, string>;
  /** Where "Exit preview" goes back to: the page the admin started the preview from. */
  returnPath: string;
};

/**
 * Marks the app loaded in the troubleshooting page's frame: `1` stamps the preview header on each
 * request, `cookie` trades `preview_code` for a preview session cookie and its token.
 */
const FRAME_PARAM = "permission-preview-frame";
const FRAME_CODE_PARAM = "preview_code";
const COOKIE_FRAME_MODE = "cookie";

// The frame's own window name survives a reload inside the frame, and nothing else shares it.
const FRAME_NAME_PREFIX = "metabase-permission-preview:";
const COOKIE_FRAME_NAME_PREFIX = "metabase-permission-preview-cookie:";

const SESSION_EXCHANGE_PATH = "/api/ee/permission_debug/preview/session";
const PREVIEW_TOKEN_HEADER = "X-Metabase-Preview-Token";
// Sent once the token is gone (after a reload in the frame): the backend refuses it rather than
// running the request as the admin.
const LOST_PREVIEW_TOKEN = "lost";

let framePreviewState: PreviewState | null = null;
let framePreviewToken: Promise<string> | null = null;
let framePreviewTokenValue: string | null = null;

/**
 * Reads the preview this tab switched into (from the URL on the first load, then from this tab's
 * sessionStorage), so every request of this tab, and only this tab, previews the same user.
 */
export function readPreviewState(): PreviewState | null {
  const params = new URLSearchParams(window.location.search);
  const state = parseUrlState(params);

  if (state != null) {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    removeParams(params, Object.values(URL_PARAMS));
    return state;
  }

  return parseStoredState(window.sessionStorage.getItem(STORAGE_KEY));
}

/**
 * Reads the preview of the app loaded in the troubleshooting page's frame, from the URL on the
 * first load and from the frame's window name on a reload. The frame shares the admin tab's
 * sessionStorage, so it never writes there: the admin page around it keeps running as the admin.
 * Returns null outside such a frame.
 */
export function readFramePreviewState(): PreviewState | null {
  if (window.self === window.top) {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const frameMode = params.get(FRAME_PARAM);
  const code = params.get(FRAME_CODE_PARAM);

  if (frameMode === COOKIE_FRAME_MODE && code != null) {
    const cookieUrlState = parseUrlState(params);
    if (cookieUrlState != null) {
      window.name = `${COOKIE_FRAME_NAME_PREFIX}${JSON.stringify(cookieUrlState)}`;
      removeParams(params, [
        ...Object.values(URL_PARAMS),
        FRAME_PARAM,
        FRAME_CODE_PARAM,
      ]);
      framePreviewToken = exchangeCodeForToken(code);
      framePreviewState = cookieUrlState;
      return framePreviewState;
    }
  }
  if (window.name.startsWith(COOKIE_FRAME_NAME_PREFIX)) {
    // the token lived in memory only, so a reload in the frame loses it
    framePreviewToken = Promise.resolve(LOST_PREVIEW_TOKEN);
    framePreviewTokenValue = LOST_PREVIEW_TOKEN;
    framePreviewState = parseStoredState(
      window.name.slice(COOKIE_FRAME_NAME_PREFIX.length),
    );
    return framePreviewState;
  }

  const urlState = frameMode === "1" ? parseUrlState(params) : null;

  if (urlState != null) {
    window.name = `${FRAME_NAME_PREFIX}${JSON.stringify(urlState)}`;
    removeParams(params, [...Object.values(URL_PARAMS), FRAME_PARAM]);
    framePreviewState = urlState;
  } else if (window.name.startsWith(FRAME_NAME_PREFIX)) {
    framePreviewState = parseStoredState(
      window.name.slice(FRAME_NAME_PREFIX.length),
    );
  }
  return framePreviewState;
}

/**
 * The user the app's requests run as: inside a frame only the frame's own preview (the tab's
 * sessionStorage belongs to the admin page around it), else this tab's, else null for no preview.
 */
export function getActivePreviewUserId(): number | null {
  if (window.self !== window.top) {
    return framePreviewToken == null
      ? (framePreviewState?.userId ?? null)
      : null;
  }
  return (
    parseStoredState(window.sessionStorage.getItem(STORAGE_KEY))?.userId ?? null
  );
}

/**
 * The token of the frame's preview session, for requests made without the API client (map tiles);
 * null outside a frame signed in by cookie, or while the exchange hasn't answered.
 */
export function getActivePreviewToken(): string | null {
  return framePreviewTokenValue;
}

/** Whether the app runs in a frame signed in by a preview session cookie rather than the header. */
export function isCookieFramePreview(): boolean {
  return framePreviewToken != null;
}

/**
 * The address of the app in the troubleshooting page's frame at `path` as `state`, signed in by a
 * preview session cookie: `code` comes from `POST /api/ee/permission_debug/preview/code`.
 */
export function getCookieFramePreviewUrl(
  path: string,
  state: PreviewState,
  code: string,
) {
  const url = new URL(getPreviewUrl(path, state));
  url.searchParams.set(FRAME_PARAM, COOKIE_FRAME_MODE);
  url.searchParams.set(FRAME_CODE_PARAM, code);
  return url.toString();
}

/**
 * The address of the app at `path` on the preview host `previewOrigin` (the
 * `permission-preview-origin` setting), signed in there by `code` from
 * `POST /api/ee/permission_debug/preview/code`.
 */
export function getPreviewHostFrameUrl(
  previewOrigin: string,
  path: string,
  code: string,
) {
  const url = new URL("/preview-session", previewOrigin);
  url.searchParams.set("code", code);
  url.searchParams.set("to", path);
  return url.toString();
}

/** The address of the app in the troubleshooting page's frame, at `path`, as `state`. */
export function getFramePreviewUrl(path: string, state: PreviewState) {
  const url = new URL(getPreviewUrl(path, state));
  url.searchParams.set(FRAME_PARAM, "1");
  return url.toString();
}

/** Where the framed app is, or null while it hasn't read its preview from the address yet. */
export function getFramePath(location: Location): string | null {
  return new URLSearchParams(location.search).has(FRAME_PARAM)
    ? null
    : `${location.pathname}${location.search}${location.hash}`;
}

function parseUrlState(params: URLSearchParams): PreviewState | null {
  const userIdParam = params.get(URL_PARAMS.userId);
  if (userIdParam == null || !/^\d+$/.test(userIdParam)) {
    return null;
  }
  return {
    userId: Number(userIdParam),
    userName: params.get(URL_PARAMS.userName) ?? "",
    principalType: parsePrincipalType(params.get(URL_PARAMS.principalType)),
    principalId: Number(params.get(URL_PARAMS.principalId) ?? userIdParam),
    principalName: params.get(URL_PARAMS.principalName) ?? "",
    attributes: parseAttributes(params.get(URL_PARAMS.attributes)),
    returnPath: getSafeReturnPath(params.get(URL_PARAMS.returnPath)),
  };
}

function removeParams(params: URLSearchParams, names: string[]) {
  names.forEach((name) => params.delete(name));
  const search = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
  );
}

function parsePrincipalType(value: unknown): PrincipalType {
  return value === "group" || value === "tenant" ? value : "user";
}

function parseAttributes(value: unknown): Record<string, string> {
  try {
    const parsed: unknown =
      typeof value === "string" ? JSON.parse(value) : value;
    if (typeof parsed !== "object" || parsed == null) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function parseStoredState(stored: string | null): PreviewState | null {
  if (stored == null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed != null &&
      "userId" in parsed &&
      typeof parsed.userId === "number" &&
      "userName" in parsed &&
      typeof parsed.userName === "string" &&
      "principalName" in parsed &&
      typeof parsed.principalName === "string" &&
      "returnPath" in parsed &&
      typeof parsed.returnPath === "string"
    ) {
      return {
        userId: parsed.userId,
        userName: parsed.userName,
        principalType: parsePrincipalType(
          "principalType" in parsed ? parsed.principalType : null,
        ),
        principalId:
          "principalId" in parsed && typeof parsed.principalId === "number"
            ? parsed.principalId
            : parsed.userId,
        principalName: parsed.principalName,
        attributes: parseAttributes(
          "attributes" in parsed ? parsed.attributes : null,
        ),
        returnPath: getSafeReturnPath(parsed.returnPath),
      };
    }
  } catch {
    // fall through: a malformed value means no preview
  }
  return null;
}

// only a path on this site, so the exit can't be pointed at another origin
function getSafeReturnPath(path: string | null) {
  return path != null && path.startsWith("/") && !path.startsWith("//")
    ? path
    : "/";
}

export function clearPreviewState() {
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function getPreviewUrl(path: string, state: PreviewState) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set(URL_PARAMS.userId, String(state.userId));
  url.searchParams.set(URL_PARAMS.userName, state.userName);
  url.searchParams.set(URL_PARAMS.principalType, state.principalType);
  url.searchParams.set(URL_PARAMS.principalId, String(state.principalId));
  url.searchParams.set(URL_PARAMS.principalName, state.principalName);
  url.searchParams.set(URL_PARAMS.attributes, JSON.stringify(state.attributes));
  url.searchParams.set(URL_PARAMS.returnPath, state.returnPath);
  return url.toString();
}

export function getPreviewTokenHandler(): OnBeforeRequestHandler {
  return async () => ({
    headers: {
      [PREVIEW_TOKEN_HEADER]: (await framePreviewToken) ?? LOST_PREVIEW_TOKEN,
    },
  });
}

// Before the API client is set up, so no request runs before the token is known.
async function exchangeCodeForToken(code: string): Promise<string> {
  try {
    const response = await fetch(SESSION_EXCHANGE_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const token = response.ok
      ? response.headers.get(PREVIEW_TOKEN_HEADER)
      : null;
    framePreviewTokenValue = token ?? LOST_PREVIEW_TOKEN;
  } catch {
    framePreviewTokenValue = LOST_PREVIEW_TOKEN;
  }
  return framePreviewTokenValue;
}

export function getPreviewAsHeaderHandler(
  state: PreviewState,
): OnBeforeRequestHandler {
  return async () => ({
    headers: { "X-Metabase-Preview-As": String(state.userId) },
  });
}
