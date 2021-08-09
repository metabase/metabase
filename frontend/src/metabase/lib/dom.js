import _ from "underscore";
import { isCypressActive } from "metabase/env";

// IE doesn't support scrollX/scrollY:
export const getScrollX = () =>
  typeof window.scrollX === "undefined" ? window.pageXOffset : window.scrollX;
export const getScrollY = () =>
  typeof window.scrollY === "undefined" ? window.pageYOffset : window.scrollY;

// denotes whether the current page is loaded in an iframe or not
// Cypress renders the whole app within an iframe, but we want to exlude it from this check to avoid certain components (like Nav bar) not rendering
export const IFRAMED = (function() {
  try {
    return !isCypressActive && window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

// add a global so we can check if the parent iframe is Metabase
window.METABASE = true;

// check that we're both iframed, and the parent is a Metabase instance
// used for detecting if we're previewing an embed
export const IFRAMED_IN_SELF = (function() {
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
export const HAS_LOCAL_STORAGE = (function() {
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

// https://davidwalsh.name/add-rules-stylesheets
const STYLE_SHEET = (function() {
  // Create the <style> tag
  const style = document.createElement("style");

  // WebKit hack :(
  style.appendChild(document.createTextNode("/* dynamic stylesheet */"));

  // Add the <style> element to the page
  document.head.appendChild(style);

  return style.sheet;
})();

export function addCSSRule(selector, rules, index = 0) {
  if ("insertRule" in STYLE_SHEET) {
    const ruleIndex = STYLE_SHEET.insertRule(
      selector + "{" + rules + "}",
      index,
    );
    return STYLE_SHEET.cssRules[ruleIndex];
  } else if ("addRule" in STYLE_SHEET) {
    const ruleIndex = STYLE_SHEET.addRule(selector, rules, index);
    return STYLE_SHEET.rules[ruleIndex];
  }
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

// need to keep track of the latest click's metaKey state because sometimes
// `open` is called asynchronously, thus window.event isn't the click event
let metaKey;
window.addEventListener(
  "mouseup",
  e => {
    metaKey = e.metaKey;
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
    ...options
  } = {},
) {
  if (shouldOpenInBlankWindow(url, options)) {
    openInBlankWindow(url);
  } else {
    openInSameWindow(url);
  }
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
    blankOnMetaKey = true,
    // open in new window for different origin
    blankOnDifferentOrigin = true,
  } = {},
) {
  if (blank) {
    return true;
  } else if (
    blankOnMetaKey &&
    (event && event.metaKey != null ? event.metaKey : metaKey)
  ) {
    return true;
  } else if (blankOnDifferentOrigin && !isSameOrigin(url)) {
    return true;
  }
  return false;
}

const a = document.createElement("a"); // reuse the same tag for performance
export function isSameOrigin(url) {
  a.href = url;
  return a.origin === window.location.origin;
}

export function getUrlTarget(url) {
  return isSameOrigin(url) ? "_self" : "_blank";
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
export function clipPathReference(id: string): string {
  // add the current page URL (with fragment removed) to support pages with <base> tag.
  // https://stackoverflow.com/questions/18259032/using-base-tag-on-a-page-that-contains-svg-marker-elements-fails-to-render-marke
  const url = window.location.href.replace(/#.*$/, "") + "#" + id;
  return `url(${url})`;
}

export function initializeIframeResizer(readyCallback = () => {}) {
  if (!IFRAMED) {
    return;
  }

  // Make iFrameResizer avaliable so that embed users can
  // have their embeds autosize to their content
  if (window.iFrameResizer) {
    console.error("iFrameResizer resizer already defined.");
    readyCallback();
  } else {
    window.iFrameResizer = {
      autoResize: true,
      heightCalculationMethod: "max",
      readyCallback: readyCallback,
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
