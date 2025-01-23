import { type Tag, highlightCode } from "@lezer/highlight";
import { useMemo } from "react";

import { parser } from "./language";

const highlighter = {
  style(tags: Tag[]) {
    // render the tokens just like codemirror does
    return tags.map(tag => `cm-token-${tag.name}`).join(" ");
  },
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

export function Highlight({ expression }: { expression: string }) {
  const __html = useMemo(() => highlight(expression), [expression]);
  return <pre dangerouslySetInnerHTML={{ __html }} />;
}
