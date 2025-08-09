import type MarkdownIt from "markdown-it";
import type { StateInline } from "markdown-it";

export function linkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("text", "smartlink", smartLinkInline);
}

function smartLinkInline(state: StateInline, silent: boolean): boolean {
  const pos = state.pos;
  const max = state.posMax;

  // Check if we have enough characters for {% entity
  if (pos + 9 > max) {
    return false;
  }
  if (state.src.slice(pos, pos + 9) !== "{% entity") {
    return false;
  }

  // Find the closing %}
  const closePos = state.src.indexOf("%}", pos + 9);
  if (closePos === -1) {
    return false;
  }

  // Extract attributes
  const content = state.src.slice(pos + 9, closePos).trim();
  const attrs = parseEntityAttributes(content);

  if (!attrs.id || !attrs.model) {
    return false;
  }

  if (!silent) {
    const token = state.push("smartlink", "", 0);
    token.attrSet("id", attrs.id);
    token.attrSet("model", attrs.model);
  }

  state.pos = closePos + 2;
  return true;
}

function parseEntityAttributes(content: string): {
  id?: string;
  model?: string;
} {
  const attrs: { id?: string; model?: string } = {};

  // Match id="..."
  const idMatch = content.match(/id="([^"]*)"/);
  if (idMatch) {
    attrs.id = idMatch[1];
  }

  // Match model="..."
  const modelMatch = content.match(/model="([^"]*)"/);
  if (modelMatch) {
    attrs.model = modelMatch[1];
  }

  return attrs;
}
