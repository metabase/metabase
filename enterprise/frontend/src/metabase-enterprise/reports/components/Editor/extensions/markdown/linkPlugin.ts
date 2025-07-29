import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline";

export function linkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("text", "smartlink", smartLinkInline);

  md.renderer.rules.smartlink = (tokens, idx) => {
    const token = tokens[idx];
    const url = token.attrGet("url");
    const text = token.attrGet("text");
    const icon = token.attrGet("icon");

    // Return empty string as we'll handle rendering in ProseMirror
    return "";
  };
}

function smartLinkInline(state: StateInline, silent: boolean): boolean {
  const pos = state.pos;
  const max = state.posMax;

  // Check if we have enough characters for {% link
  if (pos + 7 > max) {
    return false;
  }
  if (state.src.slice(pos, pos + 7) !== "{% link") {
    return false;
  }

  // Find the closing %}
  const closePos = state.src.indexOf("%}", pos + 7);
  if (closePos === -1) {
    return false;
  }

  // Extract attributes
  const content = state.src.slice(pos + 7, closePos).trim();
  const attrs = parseLinkAttributes(content);

  if (!attrs.url || !attrs.text || !attrs.icon) {
    return false;
  }

  if (!silent) {
    const token = state.push("smartlink", "", 0);
    token.attrSet("url", attrs.url);
    token.attrSet("text", attrs.text);
    token.attrSet("icon", attrs.icon);
  }

  state.pos = closePos + 2;
  return true;
}

function parseLinkAttributes(content: string): {
  url?: string;
  text?: string;
  icon?: string;
} {
  const attrs: { url?: string; text?: string; icon?: string } = {};

  // Match url="..."
  const urlMatch = content.match(/url="([^"]*)"/);
  if (urlMatch) {
    attrs.url = urlMatch[1];
  }

  // Match text="..."
  const textMatch = content.match(/text="([^"]*)"/);
  if (textMatch) {
    attrs.text = textMatch[1];
  }

  // Match icon="..."
  const iconMatch = content.match(/icon="([^"]*)"/);
  if (iconMatch) {
    attrs.icon = iconMatch[1];
  }

  return attrs;
}
