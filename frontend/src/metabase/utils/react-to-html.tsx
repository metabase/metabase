import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

/**
 * Given a React node, it renders the node into a HTML string synchronously.
 *
 * https://18.react.dev/reference/react-dom/server/renderToString#removing-rendertostring-from-the-client-code
 */
export function reactNodeToHtmlString(node: ReactNode) {
  const container = document.createElement("div");
  const root = createRoot(container);

  flushSync(() => {
    root.render(node);
  });

  return container.innerHTML;
}
