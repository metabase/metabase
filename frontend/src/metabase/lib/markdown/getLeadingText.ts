import { parseMarkdown } from "./parseMarkdown";
import type { Node } from "./types";

export const getLeadingText = (value: string): string => {
  const root = parseMarkdown(value);
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
