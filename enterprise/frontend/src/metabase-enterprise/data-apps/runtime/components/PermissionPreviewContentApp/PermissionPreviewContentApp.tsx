/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import { type ReactNode, useEffect, useState } from "react";

import { PLUGIN_API } from "metabase/api/client";
import { getSessionTokenHeaders } from "metabase/embedding/lib/auth/get-session-token-headers";
import { useGetSettingsQuery } from "metabase/settings";
import MetabaseSettings from "metabase/utils/settings";
import {
  CONTENT_PREVIEW_LOCATION_MESSAGE_TYPE,
  CONTENT_PREVIEW_PATH,
  CONTENT_PREVIEW_READY_MESSAGE_TYPE,
  getContentPreviewItemPath,
  isContentPreviewSessionMessage,
  isCookieContentPreview,
  parseContentPreviewItem,
} from "metabase-enterprise/permission_preview/content-preview";

import { DataAppProvider } from "../DataAppProvider/DataAppProvider";
import {
  OpenedDirectly,
  PreviewContent,
} from "../PermissionPreviewApp/PermissionPreviewApp";

/**
 * The troubleshooting page's frame: the item the page opened, rendered with the SDK as the previewed person.
 *
 * - On the main origin, the person's session token comes from the page by `postMessage`, stays in this document's
 *   memory, and goes out as `X-Metabase-Session` on every API request; nothing renders before it arrives, so a
 *   reload (which loses it) asks the page again.
 * - On the preview host (`?session=cookie`), the host's own cookie signs every request in, and survives a reload.
 */
export function PermissionPreviewContentApp() {
  const [hasSession, setHasSession] = useState(isCookieContentPreview);

  useEffect(() => {
    if (window.parent === window || isCookieContentPreview()) {
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
      <PersonSettingsGate>
        <PreviewContent
          initialItem={readInitialItem()}
          onLocationChange={reportLocation}
        />
      </PersonSettingsGate>
    </DataAppProvider>
  );
}

// This document's bootstrap holds the public settings only; the person's own (such as `use-tenants`, which decides
// whether the collection browser lists shared tenant collections) load once their session signs requests in, as the
// SDK loads them after sign-in.
function PersonSettingsGate({ children }: { children: ReactNode }) {
  const { isLoading } = useGetSettingsQuery();
  return isLoading ? null : <>{children}</>;
}

// `DataAppProvider` and the SDK stamp these; the server confines a request carrying them to a data app's scope
// (`data_app_scope.clj`), and this frame is no data app.
const DATA_APP_CLIENT_HEADERS = [
  "X-Metabase-Client",
  "X-Metabase-Client-Version",
  "X-Metabase-Client-Identifier",
];

/**
 * On the main origin, makes every `fetch` of this document leave the browser without cookies, so the admin's
 * session cookie, which this same-origin document would otherwise send, never signs a request in: one without the
 * previewed person's token is anonymous and fails. Requests made around `fetch` (an image, `XMLHttpRequest`) still
 * carry the cookie. On the preview host, the cookie is the person's own, so `fetch` sends it. Also drops the
 * data-app client headers.
 */
export function installContentPreviewFetch() {
  const nativeFetch = window.fetch.bind(window);
  const credentials = isCookieContentPreview() ? "same-origin" : "omit";
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    DATA_APP_CLIENT_HEADERS.forEach((name) => headers.delete(name));
    return nativeFetch(new Request(request, { headers, credentials }));
  };
}

function readInitialItem() {
  const { pathname } = window.location;
  const start = pathname.indexOf(CONTENT_PREVIEW_PATH);
  return parseContentPreviewItem(
    pathname.slice(start + CONTENT_PREVIEW_PATH.length),
  );
}

// The frame's own address follows the item or collection, so a reload reopens it.
function reportLocation(path: string) {
  const item = parseContentPreviewItem(path);
  const { pathname, search } = window.location;
  const base = pathname.slice(
    0,
    pathname.indexOf(CONTENT_PREVIEW_PATH) + CONTENT_PREVIEW_PATH.length,
  );
  window.history.replaceState(
    window.history.state,
    "",
    `${base}${item != null ? getContentPreviewItemPath(item) : ""}${search}`,
  );
  postToPage({ type: CONTENT_PREVIEW_LOCATION_MESSAGE_TYPE, path });
}

// On the preview host the page is on the site URL's origin, the only one allowed to frame this document.
function postToPage(message: { type: string; path?: string }) {
  const siteUrl = MetabaseSettings.get("site-url");
  const pageOrigin =
    isCookieContentPreview() && siteUrl != null
      ? new URL(siteUrl).origin
      : window.location.origin;
  window.parent.postMessage(message, pageOrigin);
}
