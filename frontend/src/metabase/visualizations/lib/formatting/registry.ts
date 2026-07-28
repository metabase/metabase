import type { ReactElement, ReactNode } from "react";

type JsxLinkRenderer = (url: string, text: ReactNode) => ReactElement;

let jsxLinkRenderer: JsxLinkRenderer | undefined;

export function registerJsxLinkRenderer(renderer: JsxLinkRenderer) {
  jsxLinkRenderer = renderer;
}

export function getJsxLinkRenderer() {
  return jsxLinkRenderer;
}
