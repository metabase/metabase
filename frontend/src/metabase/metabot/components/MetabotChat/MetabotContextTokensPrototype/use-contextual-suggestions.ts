// PROTOTYPE: metabot context tokens
import { match } from "ts-pattern";
import { t } from "ttag";

import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/use-entity-data";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { getName } from "metabase/utils/name";

import type { ContextToken } from "./tokens";

// PROTOTYPE: mocked — shown when there's no token and the API has no prompts
export const getGeneralSuggestions = () => [
  t`What metrics can I explore here?`,
  t`Which dashboards are most popular this month?`,
  t`Show me something interesting in our data`,
];

// PROTOTYPE: mocked — the suggested-prompts API doesn't take an entity yet
const getSuggestions = (model: SuggestionModel, name: string): string[] =>
  match(model)
    .with("dashboard", () => [
      t`Summarize the key takeaways from ${name}`,
      t`What changed on ${name} since last week?`,
      t`Which chart on ${name} looks most unusual?`,
    ])
    .with("card", () => [
      t`Explain how ${name} is calculated`,
      t`What's driving the trend in ${name}?`,
      t`Break ${name} down by another dimension`,
    ])
    .with("dataset", () => [
      t`What questions can I answer with ${name}?`,
      t`Show the 10 most recent records in ${name}`,
      t`Which columns in ${name} have the most missing values?`,
    ])
    .with("metric", () => [
      t`How has ${name} changed over the last 3 months?`,
      t`Break down ${name} by category`,
      t`Why did ${name} move recently?`,
    ])
    .with("document", () => [
      t`Summarize ${name}`,
      t`What data backs up the claims in ${name}?`,
      t`Suggest a chart to add to ${name}`,
    ])
    .with("table", () => [
      t`What's in ${name}?`,
      t`Show the 10 most recent rows in ${name}`,
      t`Which columns in ${name} are useful for grouping?`,
    ])
    .otherwise(() => [
      t`What can you tell me about ${name}?`,
      t`Show me what's in ${name}`,
      t`Find questions and dashboards related to ${name}`,
    ]);

/**
 * Prompt suggestions about the given token's entity, or `null` when there is
 * no token or its name hasn't loaded yet.
 */
export function useContextualSuggestions(
  token: ContextToken | null,
): string[] | null {
  const { entity } = useEntityData(token?.id ?? null, token?.model ?? null);
  const name = entity ? getName(entity) : token?.label;

  return token && name ? getSuggestions(token.model, name) : null;
}
