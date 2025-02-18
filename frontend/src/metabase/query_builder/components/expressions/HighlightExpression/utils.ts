import { type Highlighter, type Tag, highlightCode } from "@lezer/highlight";

import { classNameForTag } from "metabase/ui/syntax";
import { parser } from "metabase-lib/v1/expressions/tokenizer/parser";

const highlighter: Highlighter = {
  style: (tag: Tag[]) => classNameForTag(tag),
};

type HTML = string;

export function highlight(code: string): HTML {
  const tree = parser.parse(code);

  let res = "";

  function emit(text: string, className: string) {
    if (className) {
      res += `<span class="${className}">${text}</span>`;
    } else {
      res += text;
    }
  }

  function eol() {
    res += "\n";
  }

  highlightCode(code, tree, highlighter, emit, eol);

  return res;
}
