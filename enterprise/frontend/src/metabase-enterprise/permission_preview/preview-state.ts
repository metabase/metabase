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
  previewId: "preview_as_id",
  unsavedEditsId: "preview_unsaved_edits",
  isWithUnsavedEdits: "preview_with_unsaved_edits",
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
  /** Names the preview for `POST /preview/end`. */
  previewId?: string;
  /**
   * The admin's unsaved permission edits this tab was opened with, from the permissions page, and whether the preview
   * reads them. Such a tab closes on "Exit preview", back to the page still holding the edits.
   */
  unsavedEdits?: { id: string; isApplied: boolean };
};

/** Marks the app loaded in the troubleshooting page's frame. */
const FRAME_PARAM = "permission-preview-frame";

// The frame's own window name survives a reload inside the frame, and nothing else shares it.
const FRAME_NAME_PREFIX = "metabase-permission-preview:";

let framePreviewState: PreviewState | null = null;

let isPreviewStateFromUrl = false;

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
    isPreviewStateFromUrl = true;
    return state;
  }

  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  const storedState = parseStoredState(stored);
  if (stored != null && storedState == null) {
    clearPreviewState();
  }
  return storedState;
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
  const urlState =
    params.get(FRAME_PARAM) === "1" ? parseUrlState(params) : null;

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
    return framePreviewState?.userId ?? null;
  }
  return (
    parseStoredState(window.sessionStorage.getItem(STORAGE_KEY))?.userId ?? null
  );
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
  const principalTypeParam = params.get(URL_PARAMS.principalType);
  if (
    userIdParam == null ||
    !/^\d+$/.test(userIdParam) ||
    // a type this version doesn't know (a tenant) would start as a user with the same id
    (principalTypeParam != null &&
      principalTypeParam !== "user" &&
      principalTypeParam !== "group")
  ) {
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
    previewId: params.get(URL_PARAMS.previewId) ?? undefined,
    unsavedEdits: parseUnsavedEdits(
      params.get(URL_PARAMS.unsavedEditsId),
      params.get(URL_PARAMS.isWithUnsavedEdits) !== "0",
    ),
  };
}

function parseUnsavedEdits(id: unknown, isApplied: unknown) {
  return typeof id === "string" && id !== "" && typeof isApplied === "boolean"
    ? { id, isApplied }
    : undefined;
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
  return value === "group" ? value : "user";
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
      typeof parsed.returnPath === "string" &&
      // a type this version doesn't know (a tenant) would restart as a user with the same id
      (!("principalType" in parsed) ||
        parsed.principalType === "user" ||
        parsed.principalType === "group")
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
        previewId:
          "previewId" in parsed && typeof parsed.previewId === "string"
            ? parsed.previewId
            : undefined,
        unsavedEdits:
          "unsavedEdits" in parsed &&
          typeof parsed.unsavedEdits === "object" &&
          parsed.unsavedEdits != null &&
          "id" in parsed.unsavedEdits &&
          "isApplied" in parsed.unsavedEdits
            ? parseUnsavedEdits(
                parsed.unsavedEdits.id,
                parsed.unsavedEdits.isApplied,
              )
            : undefined,
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
  if (state.previewId != null) {
    url.searchParams.set(URL_PARAMS.previewId, state.previewId);
  }
  if (state.unsavedEdits != null) {
    url.searchParams.set(URL_PARAMS.unsavedEditsId, state.unsavedEdits.id);
    url.searchParams.set(
      URL_PARAMS.isWithUnsavedEdits,
      state.unsavedEdits.isApplied ? "1" : "0",
    );
  }
  return url.toString();
}

/**
 * A full load of a tab already previewing (a reload, a link that loads the whole app): the old page's `pagehide` beacon
 * ended its preview, so this load starts it again with the same person and values, and keeps the new preview's id for
 * its own end. A load from a preview link already has a fresh preview.
 */
export async function restartStoredPreview(state: PreviewState) {
  if (isPreviewStateFromUrl) {
    return;
  }
  const response = await fetch("/api/ee/permission_debug/preview/start", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      principal_type: state.principalType,
      principal_id: state.principalId,
      attributes: state.attributes,
      unsaved_edits_id: state.unsavedEdits?.isApplied
        ? state.unsavedEdits.id
        : undefined,
    }),
  });
  const started: unknown = response.ok ? await response.json() : null;
  if (
    typeof started === "object" &&
    started != null &&
    "preview_id" in started &&
    typeof started.preview_id === "string" &&
    "user_id" in started &&
    typeof started.user_id === "number"
  ) {
    state.previewId = started.preview_id;
    state.userId = started.user_id;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

/** The admin's own debugging calls (the people list, attributes, "Explain access") run as the admin, not the person. */
const ADMIN_URL = "/api/ee/permission_debug";

/** `ready`: the tab's preview has started, so the person's requests wait for it. */
export function getPreviewAsHeaderHandler(
  state: PreviewState,
  ready?: Promise<void>,
): OnBeforeRequestHandler {
  return async ({ url }) => {
    if (url === ADMIN_URL || url.startsWith(`${ADMIN_URL}/`)) {
      return undefined;
    }
    await ready;
    return { headers: { "X-Metabase-Preview-As": String(state.userId) } };
  };
}
