import { type ElementType, isValidElement } from "react";

// React 19 removed `react-dom/test-utils`, including `isElementOfType`.
// This is the same check: a valid element whose `type` matches.
export function isElementOfType(element: unknown, type: ElementType): boolean {
  return isValidElement(element) && element.type === type;
}
