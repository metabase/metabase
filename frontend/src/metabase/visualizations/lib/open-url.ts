import querystring from "querystring";

import type { LocationDescriptor, LocationDescriptorObject } from "history";

import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  clickLink,
  getPathnameWithoutSubPath,
  getSitePath,
  getWithSiteUrl,
  isSameOrSiteUrlOrigin,
  isSameOrigin,
} from "metabase/utils/dom";
import { isObject } from "metabase-types/guards";

// need to keep track of the latest click's state because sometimes
// `openUrl` is called asynchronously, thus window.event isn't the click event
let metaKey: boolean = false;
let ctrlKey: boolean = false;
window.addEventListener(
  "mouseup",
  (e: MouseEvent) => {
    metaKey = e.metaKey;
    ctrlKey = e.ctrlKey;
  },
  true,
);

type ShouldOpenInBlankWindowOptions = {
  event?: MouseEvent | null;
  blank?: boolean;
  blankOnMetaOrCtrlKey?: boolean;
  blankOnDifferentOrigin?: boolean;
};

export function shouldOpenInBlankWindow(
  url: string,
  {
    event = (typeof window !== "undefined" ? window.event : undefined) as
      | MouseEvent
      | undefined,
    // always open in new window
    blank = false,
    // open in new window if command-click
    blankOnMetaOrCtrlKey = true,
    // open in new window for different origin
    blankOnDifferentOrigin = true,
  }: ShouldOpenInBlankWindowOptions = {},
): boolean {
  if (isEmbeddingSdk()) {
    // always open in new window in modular embedding (react SDK + modular embedding)
    return true;
  }
  const isMetaKey = event && event.metaKey != null ? event.metaKey : metaKey;
  const isCtrlKey = event && event.ctrlKey != null ? event.ctrlKey : ctrlKey;

  if (blank) {
    return true;
  } else if (blankOnMetaOrCtrlKey && (isMetaKey || isCtrlKey)) {
    return true;
  } else if (blankOnDifferentOrigin && !isSameOrSiteUrlOrigin(url)) {
    return true;
  }
  return false;
}

export function getUrlTarget(
  url: string | undefined,
): "_self" | "_blank" | undefined {
  if (isEmbeddingSdk()) {
    // always open in new window in modular embedding (react SDK + modular embedding)
    return "_blank";
  }

  return url == null || isSameOrSiteUrlOrigin(url) ? "_self" : "_blank";
}

export type OpenUrlOptions = {
  openInSameWindow?: (url: string) => void;
  openInBlankWindow?: (url: string) => void;
  openInSameOrigin?: (location: LocationDescriptorObject) => void;
  ignoreSiteUrl?: boolean;
} & ShouldOpenInBlankWindowOptions;

/**
 * Opens a URL using the most appropriate strategy: in the current window,
 * a new tab, or via client-side navigation when it's an in-app Metabase URL.
 * Honours the embedding SDK's `handleLink` plugin if installed.
 */
export async function openUrl(
  url: string,
  {
    // custom function for opening in same window
    openInSameWindow = (url: string) => clickLink(url, false),
    // custom function for opening in new window
    openInBlankWindow = (url: string) => clickLink(url, true),
    // custom function for opening in same app instance
    openInSameOrigin,
    ignoreSiteUrl = false,
    ...options
  }: OpenUrlOptions = {},
): Promise<void> {
  url = ignoreSiteUrl ? url : getWithSiteUrl(url);

  // In the sdk, allow the host app to override how to open links
  if (isEmbeddingSdk()) {
    const result = await handleLinkSdkPlugin(url);
    if (result.handled) {
      // Plugin handled the link, don't continue with default behavior
      return;
    }
  }

  if (shouldOpenInBlankWindow(url, options)) {
    openInBlankWindow(url);
  } else if (isSameOrigin(url)) {
    if (!isMetabaseUrl(url)) {
      clickLink(url, false);
    } else if (openInSameOrigin) {
      const location = getLocation(url);
      if (isObject(location) && "pathname" in location) {
        openInSameOrigin(location);
      } else {
        openInSameWindow(url);
      }
    } else {
      openInSameWindow(url);
    }
  } else {
    openInSameWindow(url);
  }
}

function isMetabaseUrl(url: string): boolean {
  const urlPath = new URL(url, window.location.origin).pathname.toLowerCase();

  if (!isAbsoluteUrl(url)) {
    return true;
  }

  const pathNameWithoutSubPath = getPathnameWithoutSubPath(urlPath);
  const isPublicLink = pathNameWithoutSubPath.startsWith("/public/");
  const isEmbedding = pathNameWithoutSubPath.startsWith("/embed/");
  /**
   * (metabase#38640) We don't want to use client-side navigation for public links or embedding
   * because public app, or embed app are built using separate routes.
   **/
  if (isPublicLink || isEmbedding) {
    return false;
  }

  return isSameOrSiteUrlOrigin(url) && urlPath.startsWith(getSitePath());
}

function isAbsoluteUrl(url: string): boolean {
  return ["/", "http:", "https:", "mailto:"].some((prefix) =>
    url.startsWith(prefix),
  );
}

function getLocation(url: string): LocationDescriptor {
  try {
    const { pathname, search, hash } = new URL(url, window.location.origin);
    const query = querystring.parse(search.substring(1));
    return {
      pathname: getPathnameWithoutSubPath(pathname),
      search,
      query,
      hash,
    };
  } catch {
    return {};
  }
}
