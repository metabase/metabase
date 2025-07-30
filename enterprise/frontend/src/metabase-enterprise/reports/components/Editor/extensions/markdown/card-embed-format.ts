// Shared utility for generating card embed markdown format
export function formatCardEmbed(attrs: {
  id: number;
  snapshotId?: number;
  name?: string;
}): string {
  if (attrs.name) {
    return `{% card id=${attrs.id} snapshot=${attrs.snapshotId} name="${attrs.name}" %}`;
  } else {
    return `{% card id=${attrs.id} snapshot=${attrs.snapshotId} %}`;
  }
}

// Shared utility for generating smart link markdown format
export function formatSmartLink(attrs: {
  url: string;
  text: string;
  icon?: string;
}): string {
  return `{% link url="${attrs.url}" text="${attrs.text}" icon="${attrs.icon}" %}`;
}

// Shared utility for generating spacer markdown format
export function formatSpacer(lines: number): string {
  return `{% spacer lines=${lines} %}`;
}

// Regex pattern for matching card embeds in markdown
export const CARD_EMBED_PATTERN =
  /{%\s*card\s+id=(\d+)\s+snapshot=(\d+)(?:\s+name="([^"]*)")?\s*%}/g;

// Regex pattern for matching smart links in markdown
export const SMART_LINK_PATTERN =
  /{%\s*link\s+url="([^"]+)"\s+text="([^"]+)"\s+icon="([^"]+)"\s*%}/g;

// Regex pattern for matching spacers in markdown
export const SPACER_PATTERN = /{%\s*spacer\s+lines=(\d+)\s*%}/g;
