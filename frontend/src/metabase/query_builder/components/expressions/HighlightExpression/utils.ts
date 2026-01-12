import { type Highlighter, type Tag, highlightCode } from "@lezer/highlight";

import { parser } from "metabase/querying/expressions/tokenizer/parser";
import { classNameForTag } from "metabase/ui/syntax";

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
