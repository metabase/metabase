import querystring from "querystring";

import type { LocationDescriptor } from "history";
import _ from "underscore";

import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isCypressActive, isStorybookActive } from "metabase/env";
import MetabaseSettings from "metabase/lib/settings";
import { isObject } from "metabase-types/guards";

import { checkNotNull } from "./types";

// IE doesn't support scrollX/scrollY:
export const getScrollX = (): number =>
  typeof window.scrollX === "undefined" ? window.pageXOffset : window.scrollX;
export const getScrollY = (): number =>
  typeof window.scrollY === "undefined" ? window.pageYOffset : window.scrollY;

// denotes whether the current page is loaded in an iframe or not
// Cypress renders the whole app within an iframe, but we want to exclude it from this check to avoid certain components (like Nav bar) not rendering
// Storybook also uses an iframe to display story content, so we want to ignore it
export const isWithinIframe = function (): boolean {
  try {
    // Mock that we're embedding, so we could test embed components
    if (window.overrideIsWithinIframe) {
      return true;
    }

    if (isCypressActive || isStorybookActive) {
      return false;
    }

    return window.self !== window.top;
  } catch (e) {
    return true;
  }
};

// add a global so we can check if the parent iframe is Metabase
window.METABASE = true;

// check whether scrollbars are visible to the user,
// this is off by default on Macs, but can be changed
// Always on on most other non mobile platforms
export const getScrollBarSize = _.memoize((): number => {
  const scrollableElem = document.createElement("div"),
    innerElem = document.createElement("div");
  scrollableElem.style.width = "30px";
  scrollableElem.style.height = "30px";
  scrollableElem.style.overflow = "scroll";
  scrollableElem.style.borderWidth = "0";
  innerElem.style.width = "30px";
  innerElem.style.height = "60px";
  scrollableElem.appendChild(innerElem);
  document.body.appendChild(scrollableElem); // Elements only have width if they're in the layout
  const diff = scrollableElem.offsetWidth - scrollableElem.clientWidth;
  document.body.removeChild(scrollableElem);
  return diff;
});

// check if we have access to localStorage to avoid handling "access denied"
// exceptions
export const HAS_LOCAL_STORAGE = (function () {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    window.localStorage; // This will trigger an exception if access is denied.
    return true;
  } catch (e) {
    console.warn("localStorage not available:", e);
    return false;
  }
})();

export function isObscured(
  element: HTMLElement,
  offset?: { left: number; top: number },
): boolean {
  if (!document.elementFromPoint) {
    return false;
  }
  const box = element.getBoundingClientRect();
  // default to the center of the element
  offset = offset || {
    top: Math.round(box.height / 2),
    left: Math.round(box.width / 2),
  };
  const position = {
    left: box.x + offset.left,
    top: box.y + offset.top,
  };
  const elem = document.elementFromPoint(position.left, position.top);
  return !element.contains(elem);
}

// based on http://stackoverflow.com/a/38039019/113
export function elementIsInView(
  element: HTMLElement,
  percentX: number = 1,
  percentY: number = 1,
): boolean {
  const tolerance = 0.01; //needed because the rects returned by getBoundingClientRect provide the position up to 10 decimals

  const elementRect = element.getBoundingClientRect();
  const parentRects = [];

  while (element.parentElement != null) {
    parentRects.push(element.parentElement.getBoundingClientRect());
    element = element.parentElement;
  }

  return parentRects.every((parentRect) => {
    const visiblePixelX =
      Math.min(elementRect.right, parentRect.right) -
      Math.max(elementRect.left, parentRect.left);
    const visiblePixelY =
      Math.min(elementRect.bottom, parentRect.bottom) -
      Math.max(elementRect.top, parentRect.top);
    const visiblePercentageX = visiblePixelX / elementRect.width;
    const visiblePercentageY = visiblePixelY / elementRect.height;
    return (
      visiblePercentageX + tolerance > percentX &&
      visiblePercentageY + tolerance > percentY
    );
  });
}

export function getSitePath(): string {
  const siteUrl = checkNotNull(MetabaseSettings.get("site-url"));
  return new URL(siteUrl).pathname.toLowerCase();
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

function getWithSiteUrl(url: string): string {
  const siteUrl = MetabaseSettings.get("site-url");
  return url.startsWith("/") ? (siteUrl ?? "") + url : url;
}

// Used for tackling Safari rendering issues
// http://stackoverflow.com/a/3485654
export function forceRedraw(domNode: HTMLElement): void {
  domNode.style.display = "none";
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  domNode.offsetHeight;
  domNode.style.display = "";
}

// need to keep track of the latest click's state because sometimes
// `open` is called asynchronously, thus window.event isn't the click event
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

type OpenOptions = {
  openInSameWindow?: (url: string) => void;
  openInBlankWindow?: (url: string) => void;
  openInSameOrigin?: (location: LocationDescriptor) => void;
  ignoreSiteUrl?: boolean;
} & ShouldOpenInBlankWindowOptions;

/**
 * helper for opening links in same or different window depending on origin and
 * meta key state
 */
export async function open(
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
  }: OpenOptions = {},
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

export function openInBlankWindow(url: string): void {
  clickLink(getWithSiteUrl(url), true);
}

function clickLink(url: string, blank = false): void {
  const a = document.createElement("a");
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.href = url;
    a.rel = "noopener";
    if (blank) {
      a.target = "_blank";
    }
    a.click();
  } finally {
    a.remove();
  }
}

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

const getOrigin = (url: string): string | null => {
  try {
    return new URL(url, window.location.origin).origin;
  } catch {
    return null;
  }
};

const getLocation = (url: string): LocationDescriptor => {
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
};

export function getPathnameWithoutSubPath(pathname: string): string {
  const pathnameSections = pathname.split("/");
  const sitePathSections = getSitePath().split("/");

  return isPathnameContainSitePath(pathnameSections, sitePathSections)
    ? "/" + pathnameSections.slice(sitePathSections.length).join("/")
    : pathname;
}

function isPathnameContainSitePath(
  pathnameSections: string[],
  sitePathSections: string[],
): boolean {
  for (let index = 0; index < sitePathSections.length; index++) {
    const sitePathSection = sitePathSections[index].toLowerCase();
    const pathnameSection = pathnameSections[index].toLowerCase();

    if (sitePathSection !== pathnameSection) {
      return false;
    }
  }

  return true;
}

export function isSameOrigin(url: string): boolean {
  const origin = getOrigin(url);
  return origin == null || origin === window.location.origin;
}

function isSiteUrlOrigin(url: string): boolean {
  const siteUrl = MetabaseSettings.get("site-url");
  const siteUrlOrigin = siteUrl ? getOrigin(siteUrl) : null;
  const urlOrigin = getOrigin(url);
  return siteUrlOrigin === urlOrigin;
}

// When a url is either has the same origin or it is the same with the site url
// we want to open it in the same window (https://github.com/metabase/metabase/issues/24451)
export function isSameOrSiteUrlOrigin(url: string): boolean {
  return isSameOrigin(url) || isSiteUrlOrigin(url);
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

export function removeAllChildren(element: HTMLElement | null): void {
  if (!element) {
    return;
  }

  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

interface ParsedDataUri {
  mimeType: string | undefined;
  charset: string | undefined;
  data: string;
  base64: string;
}

export function parseDataUri(
  url: string | null | undefined,
): ParsedDataUri | null {
  // https://regexr.com/8e8gt
  const match =
    url &&
    url.match(/^data:(?:([^;]+)(?:;([^;]+))?)?(;base64)?,((?:(?!\1|,).)*)$/);
  if (match) {
    let [, mimeType, charset, base64, data]: (string | undefined)[] = match;
    if (charset === "base64" && !base64) {
      base64 = charset;
      charset = undefined;
    }
    return {
      mimeType,
      charset,
      data: base64 ? atob(data) : data,
      base64: base64 ? data : btoa(data),
    };
  }
  return null;
}

/**
 * @returns the clip-path CSS property referencing the clip path in the current document, taking into account the <base> tag.
 */
export function clipPathReference(id: string): string {
  // add the current page URL (with fragment removed) to support pages with <base> tag.
  // https://stackoverflow.com/questions/18259032/using-base-tag-on-a-page-that-contains-svg-marker-elements-fails-to-render-marke
  const url = window.location.href.replace(/#.*$/, "") + "#" + id;
  return `url(${url})`;
}

export function initializeIframeResizer(onReady = () => {}): void {
  if (!isWithinIframe()) {
    return;
  }

  // Make iFrameResizer available so that embed users can
  // have their embeds autosize to their content
  if (window.iFrameResizer) {
    console.error("iFrameResizer resizer already defined.");
    onReady();
  } else {
    window.iFrameResizer = {
      autoResize: true,
      heightCalculationMethod: "max",
      onReady,
    };

    // Make iframe-resizer available to the embed
    // We only care about contentWindow so require that minified file
    import("iframe-resizer/js/iframeResizer.contentWindow.js");
  }
}

export function isEventOverElement(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  element: Element,
): boolean {
  const { clientX: x, clientY: y } = event;
  const { top, bottom, left, right } = element.getBoundingClientRect();

  return y >= top && y <= bottom && x >= left && x <= right;
}

export function isReducedMotionPreferred(): boolean {
  const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  return mediaQuery != null && mediaQuery.matches;
}

export function getMainElement(): HTMLElement | undefined {
  const [main] = document.getElementsByTagName("main");
  return main;
}

export function isSmallScreen(): boolean {
  const mediaQuery = window.matchMedia("(max-width: 40em)");
  return mediaQuery != null && mediaQuery.matches;
}

export const getEventTarget = (
  event: MouseEvent | React.MouseEvent,
): HTMLElement => {
  let target = document.getElementById("popover-event-target");
  if (!target) {
    target = document.createElement("div");
    target.id = "popover-event-target";
    document.body.appendChild(target);
  }
  target.style.left = event.clientX - 3 + "px";
  target.style.top = event.clientY - 3 + "px";

  return target;
};

/**
 * Wrapper around window.location is used as we can't override window in jest with jsdom anymore
 * https://github.com/jsdom/jsdom/issues/3492
 */
export function reload(): void {
  window.location.reload();
}

/**
 * Wrapper around window.location is used as we can't override window in jest with jsdom anymore
 * https://github.com/jsdom/jsdom/issues/3492
 */
export function redirect(url: string): void {
  window.location.href = url;
}

export function openSaveDialog(fileName: string, fileContent: Blob): void {
  const url = URL.createObjectURL(fileContent);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();

  URL.revokeObjectURL(url);
  link.remove();
}
