import type { ReactElement, ReactNode } from "react";

type JsxLinkRenderer = (url: string, text: ReactNode) => ReactElement;

export interface MarkdownTemplateValues {
  value: unknown;
  raw: unknown;
  json: unknown;
}

type JsxMarkdownRenderer = (
  template: string,
  values: MarkdownTemplateValues,
) => ReactElement;

type JsxEmailRenderer = (mailto: string, text: ReactNode) => ReactElement;

let jsxLinkRenderer: JsxLinkRenderer | undefined;
let jsxMarkdownRenderer: JsxMarkdownRenderer | undefined;
let jsxEmailRenderer: JsxEmailRenderer | undefined;

export function registerJsxLinkRenderer(renderer: JsxLinkRenderer) {
  jsxLinkRenderer = renderer;
}

export function getJsxLinkRenderer() {
  return jsxLinkRenderer;
}

export function registerJsxMarkdownRenderer(renderer: JsxMarkdownRenderer) {
  jsxMarkdownRenderer = renderer;
}

export function getJsxMarkdownRenderer() {
  return jsxMarkdownRenderer;
}

export function registerJsxEmailRenderer(renderer: JsxEmailRenderer) {
  jsxEmailRenderer = renderer;
}

export function getJsxEmailRenderer() {
  return jsxEmailRenderer;
}
