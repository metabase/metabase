import { type Highlighter, type Tag, highlightCode } from "@lezer/highlight";

import { parser } from "metabase/querying/expressions/tokenizer/parser";
import { classNameForTag } from "metabase/ui/syntax";

const highlighter: Highlighter = {
  style: (tag: Tag[]) => classNameForTag(tag),
};

type HTML = string;

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlight(code: string): HTML {
  const tree = parser.parse(code);

  let res = "";

  function emit(text: string, className: string) {
    const escaped = escapeHTML(text);
    if (className) {
      res += `<span class="${className}">${escaped}</span>`;
    } else {
      res += escaped;
    }
  }

  function eol() {
    res += "\n";
  }

  highlightCode(code, tree, highlighter, emit, eol);

  return res;
}
