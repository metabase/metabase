import type { SmartLinkEntityRef } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/use-smart-link-entity";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";

const ENTITY_PATH_PATTERNS: { pattern: RegExp; model: SuggestionModel }[] = [
  { pattern: /^\/question\/(\d+)(?:[-/?#]|$)/, model: "card" },
  { pattern: /^\/model\/(\d+)(?:[-/?#]|$)/, model: "dataset" },
  { pattern: /^\/metric\/(\d+)(?:[-/?#]|$)/, model: "metric" },
  { pattern: /^\/dashboard\/(\d+)(?:[-/?#]|$)/, model: "dashboard" },
  { pattern: /^\/document\/(\d+)(?:[-/?#]|$)/, model: "document" },
  { pattern: /^\/table\/(\d+)(?:[-/?#]|$)/, model: "table" },
  {
    pattern:
      /^\/data-studio\/library\/tables\/\d+\/measures\/(\d+)(?:[-/?#]|$)/,
    model: "measure",
  },
  {
    pattern: /^\/question#\?db=\d+&table=\d+&segment=(\d+)$/,
    model: "segment",
  },
];

export function parseEntityPath(href: string): SmartLinkEntityRef | undefined {
  for (const { pattern, model } of ENTITY_PATH_PATTERNS) {
    const match = href.match(pattern);
    if (match) {
      return { id: parseInt(match[1], 10), model };
    }
  }
  return undefined;
}
