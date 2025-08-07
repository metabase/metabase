import type MarkdownIt from "markdown-it";
import type { ParentType, StateBlock } from "markdown-it";

export function cardPlugin(md: MarkdownIt): void {
  md.block.ruler.before("paragraph", "card", cardBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
}

function cardBlock(
  state: StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
): boolean {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];

  // Check if line starts with {% card
  if (pos + 7 > max) {
    return false;
  }
  if (state.src.slice(pos, pos + 7) !== "{% card") {
    return false;
  }

  // Find the closing %}
  const closePos = state.src.indexOf("%}", pos + 7);
  if (closePos === -1 || closePos > max) {
    return false;
  }

  // Extract attributes
  const content = state.src.slice(pos + 7, closePos).trim();
  const attrs = parseCardAttributes(content);

  if (!attrs.id) {
    return false;
  }

  if (silent) {
    return true;
  }

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;
  state.parentType = "card" as ParentType;

  // Create card token
  const token = state.push("card", "div", 0);
  token.attrSet("id", attrs.id);
  if (attrs.name) {
    token.attrSet("name", attrs.name);
  }

  token.map = [startLine, startLine + 1];

  state.parentType = oldParent;
  state.lineMax = oldLineMax;
  state.line = startLine + 1;

  return true;
}

function parseCardAttributes(content: string): {
  id?: string;
  name?: string;
} {
  const attrs: { id?: string; name?: string } = {};

  // Match id=123
  const idMatch = content.match(/id=(\d+)/);
  if (idMatch) {
    attrs.id = idMatch[1];
  }

  // Match name="..." (with proper quote handling)
  const nameMatch = content.match(/name="([^"]*)"/);
  if (nameMatch) {
    attrs.name = nameMatch[1];
  }

  return attrs;
}
