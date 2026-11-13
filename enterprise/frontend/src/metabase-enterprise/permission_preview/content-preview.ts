import { getMetabaseRootPath } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";
import { isDataAppMessage } from "metabase-enterprise/data-apps/host/lib/is-data-app-message";

/**
 * The document of the troubleshooting page's "Content only" frame: the SDK on the main origin,
 * signed in as the previewed person by a session token the page posts to it.
 */
export const CONTENT_PREVIEW_PATH = "/embed/permission-preview-content";

/** frame to page: "send me a session token"; sent on every load, so a reload asks again. */
export const CONTENT_PREVIEW_READY_MESSAGE_TYPE =
  "metabase.permission-preview-content.ready";
/** page to frame: `{ sessionToken }`, the previewed person's session. */
export const CONTENT_PREVIEW_SESSION_MESSAGE_TYPE =
  "metabase.permission-preview-content.session";
/** frame to page: `{ path }`, the item the frame shows now, as the app's path. */
export const CONTENT_PREVIEW_LOCATION_MESSAGE_TYPE =
  "metabase.permission-preview-content.location";

/** The item the content frame shows. */
export type ContentPreviewItem = {
  type: "dashboard" | "question" | "collection";
  id: number;
};

const ITEM_PATH = /^\/(question|model|metric|dashboard|collection)\/(\d+)/;

export function isContentPreviewPath(pathname: string): boolean {
  const prefix = `${getMetabaseRootPath()}${CONTENT_PREVIEW_PATH}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The content frame's address for the app's `path` (an item's path, or anything else for the collection browser). */
export function getContentPreviewUrl(path: string): string {
  const item = parseContentPreviewItem(path);
  return `${getMetabaseRootPath()}${CONTENT_PREVIEW_PATH}${item != null ? getContentPreviewItemPath(item) : ""}`;
}

/** The item an app path opens, or null for anything else. */
export function parseContentPreviewItem(
  path: string,
): ContentPreviewItem | null {
  const match = ITEM_PATH.exec(path);
  if (match == null) {
    return null;
  }
  const id = Number(match[2]);
  switch (match[1]) {
    case "dashboard":
      return { type: "dashboard", id };
    case "collection":
      return { type: "collection", id };
    default:
      return { type: "question", id };
  }
}

export function getContentPreviewItemPath({
  type,
  id,
}: ContentPreviewItem): string {
  return `/${type}/${id}`;
}

export function isContentPreviewReadyMessage(data: unknown): boolean {
  return isDataAppMessage(data, CONTENT_PREVIEW_READY_MESSAGE_TYPE);
}

export function isContentPreviewSessionMessage(
  data: unknown,
): data is { type: string; sessionToken: string } {
  return (
    isDataAppMessage(data, CONTENT_PREVIEW_SESSION_MESSAGE_TYPE) &&
    typeof data.sessionToken === "string"
  );
}

export function isContentPreviewLocationMessage(
  data: unknown,
): data is { type: string; path: string } {
  return (
    isDataAppMessage(data, CONTENT_PREVIEW_LOCATION_MESSAGE_TYPE) &&
    typeof data.path === "string"
  );
}
