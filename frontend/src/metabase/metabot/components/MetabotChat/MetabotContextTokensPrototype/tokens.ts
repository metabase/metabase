// PROTOTYPE: metabot context tokens
import { match } from "ts-pattern";

import { mbProtocolModelToSuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/suggestionUtils";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  METABSE_PROTOCOL_MD_LINK,
  type MetabaseProtocolEntityModel,
  createMetabaseProtocolLink,
  parseMetabaseProtocolMarkdownLink,
} from "metabase/urls";
import { SEARCH_MODELS, type VisualizationDisplay } from "metabase-types/api";

import type { MentionProps } from "../../editor-extensions/MetabotMention/MetabotMentionExtension";

export type ContextTokenSource = "viewing" | "mention";

export type ContextToken = {
  key: string;
  source: ContextTokenSource;
  model: SuggestionModel;
  /** `null` for an unsaved (ad-hoc) question */
  id: number | null;
  label?: string;
  display?: VisualizationDisplay;
};

const MENTION_REGEX = new RegExp(METABSE_PROTOCOL_MD_LINK, "g");

export const getTokenKey = (model: SuggestionModel, id: number | null) =>
  `${model}:${id ?? "unsaved"}`;

const isSuggestionModel = (model: string): model is SuggestionModel =>
  model === "user" ||
  // widening a readonly tuple of literals to check membership of a plain string
  (SEARCH_MODELS as readonly string[]).includes(model);

const toProtocolModel = (
  model: SuggestionModel,
): MetabaseProtocolEntityModel | null =>
  match(model)
    .returnType<MetabaseProtocolEntityModel | null>()
    .with("card", () => "question")
    .with("dataset", () => "model")
    .with(
      "dashboard",
      "collection",
      "document",
      "metric",
      "measure",
      "segment",
      "database",
      "table",
      "transform",
      (model) => model,
    )
    .otherwise(() => null);

function parseMentionLink(link: string): ContextToken | null {
  const entity = parseMetabaseProtocolMarkdownLink(link);
  if (!entity) {
    return null;
  }
  const model = mbProtocolModelToSuggestionModel(entity.model);
  return {
    key: getTokenKey(model, entity.id),
    source: "mention",
    model,
    id: entity.id,
    label: entity.name,
  };
}

/** One token per distinct entity @-mentioned in the serialized prompt. */
export function getMentionTokens(prompt: string): ContextToken[] {
  const tokens = new Map<string, ContextToken>();
  for (const [link] of prompt.matchAll(MENTION_REGEX)) {
    const token = parseMentionLink(link);
    if (token && !tokens.has(token.key)) {
      tokens.set(token.key, token);
    }
  }
  return [...tokens.values()];
}

/** Strips every inline mention of the token's entity from the serialized prompt. */
export function removeMentionFromPrompt(
  prompt: string,
  token: ContextToken,
): string {
  return prompt
    .replace(MENTION_REGEX, (link) =>
      parseMentionLink(link)?.key === token.key ? "" : link,
    )
    .replace(/ {2,}/g, " ")
    .trim();
}

export function mentionToToken(mention: MentionProps): ContextToken | null {
  const id =
    typeof mention.id === "string" ? parseInt(mention.id, 10) : mention.id;
  if (
    id == null ||
    !Number.isSafeInteger(id) ||
    !mention.model ||
    !isSuggestionModel(mention.model)
  ) {
    return null;
  }
  return {
    key: getTokenKey(mention.model, id),
    source: "mention",
    model: mention.model,
    id,
    label: mention.label,
  };
}

export function tokenToMentionLink(token: ContextToken): string | null {
  const model = toProtocolModel(token.model);
  if (token.id == null || !model) {
    return null;
  }
  return createMetabaseProtocolLink({
    id: token.id,
    model,
    name: token.label ?? "",
  });
}

/** Viewing token first, then mentions, each entity once. */
export function mergeTokens(
  viewingToken: ContextToken | null,
  mentionTokens: ContextToken[],
): ContextToken[] {
  const tokens = viewingToken ? [viewingToken] : [];
  return [
    ...tokens,
    ...mentionTokens.filter((token) => token.key !== viewingToken?.key),
  ];
}
