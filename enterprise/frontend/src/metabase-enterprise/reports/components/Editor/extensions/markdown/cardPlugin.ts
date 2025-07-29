import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block";

export function cardPlugin(md: MarkdownIt): void {
  md.block.ruler.before("paragraph", "card", cardBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  md.renderer.rules.card = (tokens, idx) => {
    const token = tokens[idx];
    const id = token.attrGet("id");
    const snapshot = token.attrGet("snapshot");
    const name = token.attrGet("name");

    // Return empty string as we'll handle rendering in ProseMirror
    return "";
  };
}

function cardBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
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

  if (!attrs.id || !attrs.snapshot) {
    return false;
  }

  if (silent) {
    return true;
  }

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;
  state.parentType = "card";

  // Create card token
  const token = state.push("card", "div", 0);
  token.attrSet("id", attrs.id);
  token.attrSet("snapshot", attrs.snapshot);
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
  snapshot?: string;
  name?: string;
} {
  const attrs: { id?: string; snapshot?: string; name?: string } = {};

  // Match id=123
  const idMatch = content.match(/id=(\d+)/);
  if (idMatch) {
    attrs.id = idMatch[1];
  }

  // Match snapshot=456
  const snapshotMatch = content.match(/snapshot=(\d+)/);
  if (snapshotMatch) {
    attrs.snapshot = snapshotMatch[1];
  }

  // Match name="..." (with proper quote handling)
  const nameMatch = content.match(/name="([^"]*)"/);
  if (nameMatch) {
    attrs.name = nameMatch[1];
  }

  return attrs;
}
