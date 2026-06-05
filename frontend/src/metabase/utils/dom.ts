import _ from "underscore";

import { isWithinIframe } from "metabase/utils/iframe";
import MetabaseSettings from "metabase/utils/settings";

import { checkNotNull } from "./types";

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
export function localStorageIsSupported() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    window.localStorage; // This will trigger an exception if access is denied.
    return true;
  } catch (e) {
    console.warn("localStorage not available:", e);
    return false;
  }
}

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

export function getSitePath(): string {
  const siteUrl = checkNotNull(MetabaseSettings.get("site-url"));
  return new URL(siteUrl).pathname.toLowerCase();
}

export function getWithSiteUrl(url: string): string {
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

export function openInBlankWindow(url: string): void {
  clickLink(getWithSiteUrl(url), true);
}

export function clickLink(url: string, blank = false): void {
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

const getOrigin = (url: string): string | null => {
  try {
    return new URL(url, window.location.origin).origin;
  } catch {
    return null;
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

export function isSmallScreen(): boolean {
  const mediaQuery = window.matchMedia("(max-width: 40em)");
  return mediaQuery != null && mediaQuery.matches;
}

export const getEventTarget = (
  event: MouseEvent | React.MouseEvent | TouchEvent,
): HTMLElement => {
  let target = document.getElementById("popover-event-target");
  if (!target) {
    target = document.createElement("div");
    target.id = "popover-event-target";
    document.body.appendChild(target);
  }

  // TouchEvent (e.g. from iOS Safari via ECharts/zrender) doesn't have
  // clientX/clientY directly — they live on individual Touch objects.
  let clientX: number;
  let clientY: number;
  if ("changedTouches" in event && event.changedTouches?.length) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = (event as MouseEvent).clientX;
    clientY = (event as MouseEvent).clientY;
  }

  target.style.left = clientX - 3 + "px";
  target.style.top = clientY - 3 + "px";

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
