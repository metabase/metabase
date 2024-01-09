import _ from "underscore";
import querystring from "querystring";
import { isCypressActive } from "metabase/env";
import MetabaseSettings from "metabase/lib/settings";

// IE doesn't support scrollX/scrollY:
export const getScrollX = () =>
  typeof window.scrollX === "undefined" ? window.pageXOffset : window.scrollX;
export const getScrollY = () =>
  typeof window.scrollY === "undefined" ? window.pageYOffset : window.scrollY;

// denotes whether the current page is loaded in an iframe or not
// Cypress renders the whole app within an iframe, but we want to exlude it from this check to avoid certain components (like Nav bar) not rendering
export const isWithinIframe = function () {
  try {
    return !isCypressActive && window.self !== window.top;
  } catch (e) {
    return true;
  }
};

// add a global so we can check if the parent iframe is Metabase
window.METABASE = true;

// check that we're both iframed, and the parent is a Metabase instance
// used for detecting if we're previewing an embed
export const IFRAMED_IN_SELF = (function () {
  try {
    return window.self !== window.top && window.top.METABASE;
  } catch (e) {
    return false;
  }
})();

// check whether scrollbars are visible to the user,
// this is off by default on Macs, but can be changed
// Always on on most other non mobile platforms
export const getScrollBarSize = _.memoize(() => {
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
    window.localStorage; // This will trigger an exception if access is denied.
    return true;
  } catch (e) {
    console.warn("localStorage not available:", e);
    return false;
  }
})();

export function isObscured(element, offset) {
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
export function elementIsInView(element, percentX = 1, percentY = 1) {
  const tolerance = 0.01; //needed because the rects returned by getBoundingClientRect provide the position up to 10 decimals

  const elementRect = element.getBoundingClientRect();
  const parentRects = [];

  while (element.parentElement != null) {
    parentRects.push(element.parentElement.getBoundingClientRect());
    element = element.parentElement;
  }

  return parentRects.every(parentRect => {
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

export function getSelectionPosition(element) {
  // input, textarea, IE
  if (element.setSelectionRange || element.createTextRange) {
    return [element.selectionStart, element.selectionEnd];
  } else {
    // contenteditable
    try {
      const selection = window.getSelection();
      // Clone the Range otherwise setStart/setEnd will mutate the actual selection in Chrome 58+ and Firefox!
      const range = selection.getRangeAt(0).cloneRange();
      const { startContainer, startOffset } = range;
      range.setStart(element, 0);
      const end = range.toString().length;
      range.setEnd(startContainer, startOffset);
      const start = range.toString().length;

      return [start, end];
    } catch (e) {
      return [0, 0];
    }
  }
}

export function setSelectionPosition(element, [start, end]) {
  // input, textarea
  if (element.setSelectionRange) {
    element.focus();
    element.setSelectionRange(start, end);
  } else if (element.createTextRange) {
    // IE
    const range = element.createTextRange();
    range.collapse(true);
    range.moveEnd("character", end);
    range.moveStart("character", start);
    range.select();
  } else {
    // contenteditable
    const selection = window.getSelection();
    const startPos = getTextNodeAtPosition(element, start);
    const endPos = getTextNodeAtPosition(element, end);
    selection.removeAllRanges();
    const range = new Range();
    range.setStart(startPos.node, startPos.position);
    range.setEnd(endPos.node, endPos.position);
    selection.addRange(range);
  }
}

export function saveSelection(element) {
  const range = getSelectionPosition(element);
  return () => setSelectionPosition(element, range);
}

export function getCaretPosition(element) {
  return getSelectionPosition(element)[1];
}

export function setCaretPosition(element, position) {
  setSelectionPosition(element, [position, position]);
}

export function saveCaretPosition(element) {
  const position = getCaretPosition(element);
  return () => setCaretPosition(element, position);
}

function getTextNodeAtPosition(root, index) {
  const treeWalker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    elem => {
      if (index > elem.textContent.length) {
        index -= elem.textContent.length;
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  );
  const c = treeWalker.nextNode();
  return {
    node: c ? c : root,
    position: c ? index : 0,
  };
}

export function constrainToScreen(element, direction, padding) {
  if (!element) {
    return false;
  }
  if (direction === "bottom") {
    const screenBottom = window.innerHeight + getScrollY();
    const overflowY = element.getBoundingClientRect().bottom - screenBottom;
    if (overflowY + padding > 0) {
      element.style.maxHeight =
        element.getBoundingClientRect().height - overflowY - padding + "px";
      return true;
    }
  } else if (direction === "top") {
    const screenTop = getScrollY();
    const overflowY = screenTop - element.getBoundingClientRect().top;
    if (overflowY + padding > 0) {
      element.style.maxHeight =
        element.getBoundingClientRect().height - overflowY - padding + "px";
      return true;
    }
  } else {
    throw new Error("Direction " + direction + " not implemented");
  }
  return false;
}

function getSitePath() {
  return new URL(MetabaseSettings.get("site-url")).pathname.toLowerCase();
}

function isMetabaseUrl(url) {
  const urlPath = new URL(url, window.location.origin).pathname.toLowerCase();

  if (!isAbsoluteUrl(url)) {
    return true;
  }

  return isSameOrSiteUrlOrigin(url) && urlPath.startsWith(getSitePath());
}

function isAbsoluteUrl(url) {
  return ["/", "http:", "https:", "mailto:"].some(prefix =>
    url.startsWith(prefix),
  );
}

function getWithSiteUrl(url) {
  const siteUrl = MetabaseSettings.get("site-url");
  return url.startsWith("/") ? siteUrl + url : url;
}

// Used for tackling Safari rendering issues
// http://stackoverflow.com/a/3485654
export function forceRedraw(domNode) {
  domNode.style.display = "none";
  domNode.offsetHeight;
  domNode.style.display = "";
}

export function moveToBack(element) {
  if (element && element.parentNode) {
    element.parentNode.insertBefore(element, element.parentNode.firstChild);
  }
}

export function moveToFront(element) {
  if (element && element.parentNode) {
    element.parentNode.appendChild(element);
  }
}

// need to keep track of the latest click's state because sometimes
// `open` is called asynchronously, thus window.event isn't the click event
let metaKey;
let ctrlKey;
window.addEventListener(
  "mouseup",
  e => {
    metaKey = e.metaKey;
    ctrlKey = e.ctrlKey;
  },
  true,
);

/**
 * helper for opening links in same or different window depending on origin and
 * meta key state
 */
export function open(
  url,
  {
    // custom function for opening in same window
    openInSameWindow = url => clickLink(url, false),
    // custom function for opening in new window
    openInBlankWindow = url => clickLink(url, true),
    // custom function for opening in same app instance
    openInSameOrigin,
    ignoreSiteUrl = false,
    ...options
  } = {},
) {
  url = ignoreSiteUrl ? url : getWithSiteUrl(url);

  if (shouldOpenInBlankWindow(url, options)) {
    openInBlankWindow(url);
  } else if (isSameOrigin(url)) {
    if (!isMetabaseUrl(url)) {
      clickLink(url, false);
    } else {
      openInSameOrigin(getLocation(url));
    }
  } else {
    openInSameWindow(url);
  }
}

export function openInBlankWindow(url) {
  clickLink(getWithSiteUrl(url), true);
}

function clickLink(url, blank = false) {
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

export function shouldOpenInBlankWindow(
  url,
  {
    event = window.event,
    // always open in new window
    blank = false,
    // open in new window if command-click
    blankOnMetaOrCtrlKey = true,
    // open in new window for different origin
    blankOnDifferentOrigin = true,
  } = {},
) {
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

const getOrigin = url => {
  try {
    return new URL(url, window.location.origin).origin;
  } catch {
    return null;
  }
};

const getLocation = url => {
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

function getPathnameWithoutSubPath(pathname) {
  const pathnameSections = pathname.split("/");
  const sitePathSections = getSitePath().split("/");

  return isPathnameContainSitePath(pathnameSections, sitePathSections)
    ? "/" + pathnameSections.slice(sitePathSections.length).join("/")
    : pathname;
}

function isPathnameContainSitePath(pathnameSections, sitePathSections) {
  for (let index = 0; index < sitePathSections.length; index++) {
    const sitePathSection = sitePathSections[index].toLowerCase();
    const pathnameSection = pathnameSections[index].toLowerCase();

    if (sitePathSection !== pathnameSection) {
      return false;
    }
  }

  return true;
}

export function isSameOrigin(url) {
  const origin = getOrigin(url);
  return origin == null || origin === window.location.origin;
}

function isSiteUrlOrigin(url) {
  const siteUrl = getOrigin(MetabaseSettings.get("site-url"));
  const urlOrigin = getOrigin(url);
  return siteUrl === urlOrigin;
}

// When a url is either has the same origin or it is the same with the site url
// we want to open it in the same window (https://github.com/metabase/metabase/issues/24451)
export function isSameOrSiteUrlOrigin(url) {
  return isSameOrigin(url) || isSiteUrlOrigin(url);
}

export function getUrlTarget(url) {
  return isSameOrSiteUrlOrigin(url) ? "_self" : "_blank";
}

export function removeAllChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function parseDataUri(url) {
  const match =
    url && url.match(/^data:(?:([^;]+)(?:;([^;]+))?)?(;base64)?,(.*)$/);
  if (match) {
    let [, mimeType, charset, base64, data] = match;
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
export function clipPathReference(id) {
  // add the current page URL (with fragment removed) to support pages with <base> tag.
  // https://stackoverflow.com/questions/18259032/using-base-tag-on-a-page-that-contains-svg-marker-elements-fails-to-render-marke
  const url = window.location.href.replace(/#.*$/, "") + "#" + id;
  return `url(${url})`;
}

export function initializeIframeResizer(onReady = () => {}) {
  if (!isWithinIframe()) {
    return;
  }

  // Make iFrameResizer avaliable so that embed users can
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

    // FIXME: Crimes
    // This is needed so the FE test framework which runs in node
    // without the avaliability of require.ensure skips over this part
    // which is for external purposes only.
    //
    // Ideally that should happen in the test config, but it doesn't
    // seem to want to play nice when messing with require
    if (typeof require.ensure !== "function") {
      return false;
    }

    // Make iframe-resizer avaliable to the embed
    // We only care about contentWindow so require that minified file

    require.ensure([], require => {
      require("iframe-resizer/js/iframeResizer.contentWindow.js");
    });
  }
}

export function isEventOverElement(event, element) {
  const { clientX: x, clientY: y } = event;
  const { top, bottom, left, right } = element.getBoundingClientRect();

  return y >= top && y <= bottom && x >= left && x <= right;
}

export function isReducedMotionPreferred() {
  const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  return mediaQuery && mediaQuery.matches;
}

export function getMainElement() {
  const [main] = document.getElementsByTagName("main");
  return main;
}

export function isSmallScreen() {
  const mediaQuery = window.matchMedia("(max-width: 40em)");
  return mediaQuery && mediaQuery.matches;
}

/**
 * @param {MouseEvent<Element, MouseEvent>} event
 */
export const getEventTarget = event => {
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
export function reload() {
  window.location.reload();
}

/**
 * Wrapper around window.location is used as we can't override window in jest with jsdom anymore
 * https://github.com/jsdom/jsdom/issues/3492
 */
export function redirect(url) {
  window.location.href = url;
}
