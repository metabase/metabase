import type * as React from "react";
import * as ReactIs from "react-is";

// checking to see if the `element` is in JSX.IntrinisicElements since they support refs
// tippy's `children` prop seems to complain about anything more specific that React.ReactElement, unfortunately
export function isReactDOMTypeElement(
  element: any,
): element is React.ReactElement {
  return ReactIs.isElement(element) && typeof element.type === "string";
}

export function isReactComponent(
  component: any,
): component is React.FC | React.Component | React.ExoticComponent {
  return (
    typeof component === "function" ||
    // Checking for "Exotic" components such as ones returned by memo, forwardRef
    (typeof component === "object" &&
      "$$typeof" in component &&
      typeof component["$$typeof"] === "symbol")
  );
}
