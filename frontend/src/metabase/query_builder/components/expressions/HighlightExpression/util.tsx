import { type Tag, highlightCode } from "@lezer/highlight";

import { parser } from "metabase-lib/v1/expressions/tokenizer/parser";

import S from "./HighlightExpression.module.css";

const highlighter = {
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

function classNameForTag(tag: Tag | Tag[]): string {
  if (Array.isArray(tag)) {
    return tag.map(classNameForTag).join(" ");
  }

  // lezer generates tags like function(variableName) for combined tags
  // we split them up here so we generate classNames like .function.variableName
  const names = tag.toString().split(/[\(\)]/);

  return names
    .map(name => S[name] ?? "")
    .filter(x => x !== "")
    .join(" ");
}
