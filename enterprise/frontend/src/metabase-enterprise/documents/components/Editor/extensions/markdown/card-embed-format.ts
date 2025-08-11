// Shared utility for generating card embed markdown format
import type { CardEmbedAttributes } from "metabase-enterprise/documents/components/Editor/extensions/CardEmbed";

export function formatCardEmbed(attrs: CardEmbedAttributes): string {
  if (attrs.name) {
    return `{% card id=${attrs.id} name="${attrs.name}" %}`;
  } else {
    return `{% card id=${attrs.id} %}`;
  }
}

// Shared utility for generating smart link markdown format
export function formatSmartLink(attrs: {
  entityId?: number;
  model?: string;
}): string {
  return `{% entity id="${attrs.entityId}" model="${attrs.model}" %}`;
}

// Shared utility for generating spacer markdown format
export function formatSpacer(lines: number): string {
  return `{% spacer lines=${lines} %}`;
}

// Regex pattern for matching card embeds in markdown
export const CARD_EMBED_PATTERN =
  /{%\s*card\s+id=(\d+)(?:\s+name="([^"]*)")?\s*%}/g;

// Regex pattern for matching smart links in markdown
export const SMART_LINK_PATTERN =
  /{%\s*entity\s+id="(\d+)"\s+model="([^"]+)"\s*%}/g;

// Regex pattern for matching spacers in markdown
export const SPACER_PATTERN = /{%\s*spacer\s+lines=(\d+)\s*%}/g;
