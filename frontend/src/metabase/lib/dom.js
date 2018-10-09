// IE doesn't support scrollX/scrollY:
export const getScrollX = () =>
  typeof window.scrollX === "undefined" ? window.pageXOffset : window.scrollX;
export const getScrollY = () =>
  typeof window.scrollY === "undefined" ? window.pageYOffset : window.scrollY;

// denotes whether the current page is loaded in an iframe or not
export const IFRAMED = (function() {
  try {
    return window.self !== window.top;
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

export function isObscured(element, offset) {
  if (!document.elementFromPoint) {
    return false;
  }
  // default to the center of the element
  offset = offset || {
    top: Math.round(element.offsetHeight / 2),
    left: Math.round(element.offsetWidth / 2),
  };
  let position = findPosition(element, true);
  let elem = document.elementFromPoint(
    position.left + offset.left,
    position.top + offset.top,
  );
  return !element.contains(elem);
}

// get the position of an element on the page
export function findPosition(element, excludeScroll = false) {
  let offset = { top: 0, left: 0 };
  let scroll = { top: 0, left: 0 };
  let offsetParent = element;
  while (offsetParent) {
    // we need to check every element for scrollTop/scrollLeft
    scroll.left += element.scrollLeft || 0;
    scroll.top += element.scrollTop || 0;
    // but only the original element and offsetParents for offsetTop/offsetLeft
    if (offsetParent === element) {
      offset.left += element.offsetLeft;
      offset.top += element.offsetTop;
      offsetParent = element.offsetParent;
    }
    element = element.parentNode;
  }
  if (excludeScroll) {
    offset.left -= scroll.left;
    offset.top -= scroll.top;
  }
  return offset;
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
  let range = getSelectionPosition(element);
  return () => setSelectionPosition(element, range);
}

export function getCaretPosition(element) {
  return getSelectionPosition(element)[1];
}

export function setCaretPosition(element, position) {
  setSelectionPosition(element, [position, position]);
}

export function saveCaretPosition(element) {
  let position = getCaretPosition(element);
  return () => setCaretPosition(element, position);
}

function getTextNodeAtPosition(root, index) {
  let treeWalker = document.createTreeWalker(
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
  let c = treeWalker.nextNode();
  return {
    node: c ? c : root,
    position: c ? index : 0,
  };
}

// https://davidwalsh.name/add-rules-stylesheets
let STYLE_SHEET = (function() {
  // Create the <style> tag
  let style = document.createElement("style");

  // WebKit hack :(
  style.appendChild(document.createTextNode("/* dynamic stylesheet */"));

  // Add the <style> element to the page
  document.head.appendChild(style);

  return style.sheet;
})();

export function addCSSRule(selector, rules, index = 0) {
  if ("insertRule" in STYLE_SHEET) {
    STYLE_SHEET.insertRule(selector + "{" + rules + "}", index);
  } else if ("addRule" in STYLE_SHEET) {
    STYLE_SHEET.addRule(selector, rules, index);
  }
}

export function constrainToScreen(element, direction, padding) {
  if (!element) {
    return false;
  }
  if (direction === "bottom") {
    let screenBottom = window.innerHeight + getScrollY();
    let overflowY = element.getBoundingClientRect().bottom - screenBottom;
    if (overflowY + padding > 0) {
      element.style.maxHeight =
        element.getBoundingClientRect().height - overflowY - padding + "px";
      return true;
    }
  } else if (direction === "top") {
    let screenTop = getScrollY();
    let overflowY = screenTop - element.getBoundingClientRect().top;
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

/**
 * @returns the clip-path CSS property referencing the clip path in the current document, taking into account the <base> tag.
 */
export function clipPathReference(id: string): string {
  // add the current page URL (with fragment removed) to support pages with <base> tag.
  // https://stackoverflow.com/questions/18259032/using-base-tag-on-a-page-that-contains-svg-marker-elements-fails-to-render-marke
  const url = window.location.href.replace(/#.*$/, "") + "#" + id;
  return `url(${url})`;
}
