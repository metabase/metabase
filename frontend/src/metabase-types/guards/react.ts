import type * as React from "react";
import * as ReactIs from "react-is";

// checking to see if the `element` is in JSX.IntrinisicElements since they support refs
// tippy's `children` prop seems to complain about anything more specific that React.ReactElement, unfortunately
export function isReactDOMTypeElement(
  element: any,
): element is React.ReactElement {
  return ReactIs.isElement(element) && typeof element.type === "string";
}
