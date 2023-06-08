import { parseMarkdown } from "./parseMarkdown";
import type { Node } from "./types";

const PARSE_OPTIONS = {
  disallowedElements: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "html",
    "ol",
    "ul",
    "a",
    "code",
    "pre",
  ],
  unwrapDisallowed: true,
};

export const getLeadingText = (value: string): string => {
  const root = parseMarkdown(value, PARSE_OPTIONS);
  const firstTextChild = root.children.find(child => renderText(child));
  return firstTextChild ? renderText(firstTextChild) : "";
};

const renderText = (node: Node): string => {
  if (node.type === "text") {
    return node.value;
  }

  if (node.type === "element") {
    return node.children.map(renderText).join("");
  }

  return "";
};
