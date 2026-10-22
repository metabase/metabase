import { DATA_APP_COMMENT_MAX_TARGET_CHARS } from "../constants/comments-channel";
import type {
  DataAppCommentRect,
  DataAppCommentTarget,
} from "../types/comments";

import { buildElementSelector, describeElementLabel } from "./dom-selector";
import { describeReactTarget } from "./react-source";

export interface TargetContext {
  /** The app directory, so source locations are reported relative to it. */
  appRoot: string | null;
  /** The element the app renders into; selectors stop there. */
  rootElement: Element | null;
}

const truncate = (value: string): string =>
  value.length > DATA_APP_COMMENT_MAX_TARGET_CHARS
    ? `${value.slice(0, DATA_APP_COMMENT_MAX_TARGET_CHARS)}…`
    : value;

const collapseWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const readText = (element: Element): string | null => {
  const text = collapseWhitespace(element.textContent ?? "");

  return text === "" ? null : truncate(text);
};

const readMarkup = (element: Element): string | null => {
  const markup = element.outerHTML;

  return markup ? truncate(markup) : null;
};

const toRect = (rect: DOMRect | DataAppCommentRect): DataAppCommentRect => ({
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
});

/** Where the preview is, so a comment on a multi-page app names its page. */
const readRoute = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

const readViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

/**
 * Describes what the author selected, in the terms an agent needs to find it in
 * the source: the file and line the markup was written on, the components that
 * rendered it, a selector that finds the node again, and the text and markup as
 * rendered.
 *
 * `rect` is the dragged rectangle for a region selection, and the element's own
 * box for a click.
 */
export const describeCommentTarget = (
  element: Element,
  context: TargetContext,
  region?: DataAppCommentRect,
): DataAppCommentTarget => {
  const { source, componentPath } = describeReactTarget(
    element,
    context.appRoot,
  );
  const elementLabel = describeElementLabel(element);
  const component = componentPath.at(-1);

  return {
    kind: region ? "region" : "element",
    label: component ? `${component} › ${elementLabel}` : elementLabel,
    selector: buildElementSelector(element, context.rootElement),
    componentPath,
    source,
    rect: toRect(region ?? element.getBoundingClientRect()),
    viewport: readViewport(),
    route: readRoute(),
    text: readText(element),
    html: readMarkup(element),
  };
};
