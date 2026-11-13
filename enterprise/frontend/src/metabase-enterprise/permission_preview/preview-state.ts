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
 * Reads the preview this tab switched into (from the URL on the first load, then from this tab's
 * sessionStorage), so every request of this tab, and only this tab, previews the same user.
 */
export function readPreviewState(): PreviewState | null {
  const params = new URLSearchParams(window.location.search);
  const userIdParam = params.get(URL_PARAMS.userId);

  if (userIdParam != null && /^\d+$/.test(userIdParam)) {
    const state: PreviewState = {
      userId: Number(userIdParam),
      userName: params.get(URL_PARAMS.userName) ?? "",
      principalType: parsePrincipalType(params.get(URL_PARAMS.principalType)),
      principalId: Number(params.get(URL_PARAMS.principalId) ?? userIdParam),
      principalName: params.get(URL_PARAMS.principalName) ?? "",
      attributes: parseAttributes(params.get(URL_PARAMS.attributes)),
      returnPath: getSafeReturnPath(params.get(URL_PARAMS.returnPath)),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    Object.values(URL_PARAMS).forEach((param) => params.delete(param));
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
    return state;
  }

  return parseStoredState(window.sessionStorage.getItem(STORAGE_KEY));
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

export function getPreviewAsHeaderHandler(
  state: PreviewState,
): OnBeforeRequestHandler {
  return async () => ({
    headers: { "X-Metabase-Preview-As": String(state.userId) },
  });
}
