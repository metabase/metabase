/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import { useEffect, useState } from "react";

import { PLUGIN_API } from "metabase/api/client";
import { getSessionTokenHeaders } from "metabase/embedding/lib/auth/get-session-token-headers";
import {
  CONTENT_PREVIEW_LOCATION_MESSAGE_TYPE,
  CONTENT_PREVIEW_PATH,
  CONTENT_PREVIEW_READY_MESSAGE_TYPE,
  type ContentPreviewItem,
  getContentPreviewItemPath,
  isContentPreviewSessionMessage,
  parseContentPreviewItem,
} from "metabase-enterprise/permission_preview/content-preview";

import { DataAppProvider } from "../DataAppProvider/DataAppProvider";
import {
  OpenedDirectly,
  PreviewContent,
} from "../PermissionPreviewApp/PermissionPreviewApp";

/**
 * The troubleshooting page's "Content only" frame, on the main origin: the item the page opened, rendered with the
 * SDK as the previewed person. The person's session token comes from the page by `postMessage`, stays in this
 * document's memory, and goes out as `X-Metabase-Session` on every API request; nothing renders before it arrives,
 * so a reload (which loses it) asks the page again.
 */
export function PermissionPreviewContentApp() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (window.parent === window) {
      return;
    }
    const handleMessage = (event: MessageEvent<unknown>) => {
      const isFromPage =
        event.origin === window.location.origin &&
        event.source === window.parent;
      if (!isFromPage || !isContentPreviewSessionMessage(event.data)) {
        return;
      }
      const { sessionToken } = event.data;
      window.removeEventListener("message", handleMessage);
      PLUGIN_API.onBeforeRequestHandlers.setEmbeddingRequestAuthHeaders =
        async () => getSessionTokenHeaders(sessionToken);
      setHasSession(true);
    };
    window.addEventListener("message", handleMessage);
    postToPage({ type: CONTENT_PREVIEW_READY_MESSAGE_TYPE });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (window.parent === window) {
    return <OpenedDirectly />;
  }

  // the theme provider (and so any Mantine component) is inside `DataAppProvider`, which mustn't render yet
  if (!hasSession) {
    return null;
  }

  return (
    <DataAppProvider appSlug="permission-preview-content">
      <PreviewContent
        initialItem={readInitialItem()}
        onItemChange={reportItem}
      />
    </DataAppProvider>
  );
}

// `DataAppProvider` and the SDK stamp these; the server confines a request carrying them to a data app's scope
// (`data_app_scope.clj`), and this frame is no data app.
const DATA_APP_CLIENT_HEADERS = [
  "X-Metabase-Client",
  "X-Metabase-Client-Version",
  "X-Metabase-Client-Identifier",
];

/**
 * Makes every `fetch` of this document leave the browser without cookies, so the admin's session cookie, which
 * this same-origin document would otherwise send, never signs a request in: one without the previewed person's
 * token is anonymous and fails. Requests made around `fetch` (an image, `XMLHttpRequest`) still carry the cookie.
 * Also drops the data-app client headers.
 */
export function installContentPreviewFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    DATA_APP_CLIENT_HEADERS.forEach((name) => headers.delete(name));
    return nativeFetch(new Request(request, { headers, credentials: "omit" }));
  };
}

function readInitialItem() {
  const { pathname } = window.location;
  const start = pathname.indexOf(CONTENT_PREVIEW_PATH);
  return parseContentPreviewItem(
    pathname.slice(start + CONTENT_PREVIEW_PATH.length),
  );
}

// The frame's own address follows the item, so a reload reopens it.
function reportItem(item: ContentPreviewItem | null) {
  const path = item != null ? getContentPreviewItemPath(item) : "";
  const { pathname } = window.location;
  const base = pathname.slice(
    0,
    pathname.indexOf(CONTENT_PREVIEW_PATH) + CONTENT_PREVIEW_PATH.length,
  );
  window.history.replaceState(window.history.state, "", `${base}${path}`);
  postToPage({
    type: CONTENT_PREVIEW_LOCATION_MESSAGE_TYPE,
    path: path || "/collection/root",
  });
}

function postToPage(message: { type: string; path?: string }) {
  window.parent.postMessage(message, window.location.origin);
}
