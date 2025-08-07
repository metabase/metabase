import type MarkdownIt from "markdown-it";
import type { StateBlock } from "markdown-it";

export const spacerPlugin = (md: MarkdownIt) => {
  const RE = /^\{%[ \t]*spacer[ \t]+lines=(\d+)[ \t]*%}[ \t]*$/;

  function spacerRule(
    state: StateBlock,
    startLine: number,
    _endLine: number,
    silent: boolean,
  ) {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const lineStr = state.src.slice(pos, max);

    const m = RE.exec(lineStr);
    if (!m) {
      return false;
    }
    if (silent) {
      return true;
    }

    const token = state.push("spacer", "", 0);
    token.block = true;
    token.map = [startLine, startLine + 1];
    token.attrSet("lines", m[1]);

    state.line = startLine + 1;
    return true;
  }

  md.block.ruler.before("fence", "spacer", spacerRule, {
    alt: ["paragraph", "blockquote", "list"],
  });
};
