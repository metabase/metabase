import { HighlightStyle } from "@codemirror/language";
import { type Tag, highlightCode, tags } from "@lezer/highlight";

import { parser } from "../language";

import S from "./Highlight.module.css";

function className(tag: Tag | Tag[]): string {
  if (Array.isArray(tag)) {
    return tag.map(className).join(" ");
  }

  const name = tag.toString();
  return S[name] ?? "";
}

export const highlightStyle = HighlightStyle.define([
  {
    tag: tags.function(tags.variableName),
    class: S,
  },
  ...Object.values(tags)
    .filter((tag): tag is Tag => typeof tag !== "function")
    .map((tag: Tag) => ({
      tag,
      class: className(tag),
    })),
]);

const highlighter = {
  style: (tag: Tag[]) => className(tag),
};

export function highlight(code: string): string {
  const tree = parser.parse(code);

  let res = "";

  function emit(text: string, className: string) {
    if (className) {
      res += `<span class="${className}">${text}</span>`;
    } else {
      res += text;
    }
  }
  function brk() {
    res += "\n";
  }

  highlightCode(code, tree, highlighter, emit, brk);

  return res;
}
