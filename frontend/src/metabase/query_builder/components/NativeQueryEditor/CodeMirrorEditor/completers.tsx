import type { CompletionContext } from "@codemirror/autocomplete";
import { useCallback } from "react";
import slugg from "slugg";
import { t } from "ttag";

import { useLazyGetCardQuery, useListSnippetsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { isNotNull } from "metabase/lib/types";
import { MetabaseApi } from "metabase/services";
import type {
  Card,
  CardId,
  CardType,
  DatabaseId,
  Field,
} from "metabase-types/api";

import { getCardAutocompleteResultMeta, matchTagAtCursor } from "./util";

// Keep this in sync with the limit in the backend code at
// `autocomplete-suggestions` in src/metabase/api/database.clj
const AUTOCOMPLETE_SUGGESTIONS_LIMIT = 50;

type SchemaCompletionOptions = {
  databaseId?: DatabaseId | null;
};

// Completes column and table names from the database schema
export function useSchemaCompletion({ databaseId }: SchemaCompletionOptions) {
  const matchStyle = useSetting("native-query-autocomplete-match-style");

  return useCallback(
    async function (context: CompletionContext) {
      if (matchStyle === "off" || databaseId == null) {
        return null;
      }

      const tag = matchTagAtCursor(context.state, {
        allowOpenEnded: true,
        position: context.pos,
      });

      if (tag) {
        // the cursor is inside in a variable, card or snippet tag
        // do not complete identifiers here
        return null;
      }

      const word = context.matchBefore(/\w+/);
      if (!word) {
        return null;
      }

      const results: [string, string][] =
        await MetabaseApi.db_autocomplete_suggestions({
          dbId: databaseId,
          query: word.text.trim(),
          matchStyle,
        });

      return {
        from: word.from,
        options: results.map(([value, meta]) => ({
          label: value,
          detail: meta,
          boost: 50,
        })),
        validFor(text: string) {
          if (results.length >= AUTOCOMPLETE_SUGGESTIONS_LIMIT) {
            // If there are more suggestions than the limit, we want subsequent
            // edits to fetch more completions because we can't assume that we've seen all
            // suggestions
            return false;
          }

          return text.startsWith(word.text);
        },
      };
    },
    [databaseId, matchStyle],
  );
}

// Completes snippet names when inside a snippet tag
export function useSnippetCompletion() {
  const { data: snippets } = useListSnippetsQuery();

  return useCallback(
    function completeSnippetTags(context: CompletionContext) {
      const tag = matchTagAtCursor(context.state, {
        allowOpenEnded: true,
        position: context.pos,
      });

      if (tag?.type !== "snippet") {
        return null;
      }

      const query = tag.content.text;
      const results =
        snippets?.filter(snippet =>
          snippet.name.toLowerCase().includes(query.toLowerCase()),
        ) ?? [];

      return {
        from: tag.content.from,
        validFor(text: string) {
          return text.startsWith(query);
        },
        options: results.map(snippet => ({
          label: snippet.name,
          apply: tag.hasClosingTag ? snippet.name : `${snippet.name} }}`,
          detail: t`Snippet`,
          boost: 50,
        })),
      };
    },
    [snippets],
  );
}

// Keep this in sync with the limit in the backend code at
// `autocomplete-cards` in src/metabase/api/database.clj
const AUTOCOMPLETE_CARD_SUGGESTIONS_LIMIT = 50;

type CardTagCompletionOptions = {
  databaseId?: DatabaseId | null;
};

// Completes card names when inside a card tag
export function useCardTagCompletion({ databaseId }: CardTagCompletionOptions) {
  return useCallback(
    async function completeCardTags(context: CompletionContext) {
      if (databaseId == null) {
        return null;
      }

      const tag = matchTagAtCursor(context.state, {
        allowOpenEnded: true,
        position: context.pos,
      });

      if (tag?.type !== "card") {
        return null;
      }
      const query = tag.content.text.replace(/^#/, "").trim();
      if (!query) {
        return null;
      }

      const results: {
        id: number;
        name: string;
        type: CardType;
        collection_name: string;
      }[] = await MetabaseApi.db_card_autocomplete_suggestions({
        dbId: databaseId,
        query,
      });

      return {
        // -1 because we want to include the # in the autocomplete
        from: tag.content.from - 1,
        options: results.map(({ id, name, type, collection_name }) => ({
          label: `#${id}-${slugg(name)}`,
          detail: getCardAutocompleteResultMeta(type, collection_name),
          apply: tag.hasClosingTag
            ? `#${id}-${slugg(name)}`
            : `#${id}-${slugg(name)} }}`,
          boost: 50,
        })),
        validFor(text: string) {
          if (results.length >= AUTOCOMPLETE_CARD_SUGGESTIONS_LIMIT) {
            // If there are more suggestions than the limit, we want subsequent
            // edits to fetch more completions because we can't assume that we've seen all
            // suggestions
            return false;
          }
          return text.startsWith(`#${query}`);
        },
      };
    },
    [databaseId],
  );
}

type ReferencedCardCompletionOptions = {
  referencedQuestionIds: CardId[];
};

// Completes column names of cards referenced in the query through a
// card tag (eg. `{{ #42-named-card-tag }}`)
export function useReferencedCardCompletion({
  referencedQuestionIds,
}: ReferencedCardCompletionOptions) {
  const [getCard] = useLazyGetCardQuery();

  const getCardColumns = useCallback(async (): Promise<
    { card: Card; field: Field }[]
  > => {
    const data = await Promise.all(
      referencedQuestionIds.map(id => getCard({ id }, true)),
    );
    return data
      .map(item => item.data)
      .filter(isNotNull)
      .flatMap(card =>
        card.result_metadata.map(field => ({
          card,
          field,
        })),
      );
  }, [referencedQuestionIds, getCard]);

  return useCallback(
    async function completeReferencedCardIdentifiers(
      context: CompletionContext,
    ) {
      const tag = matchTagAtCursor(context.state, {
        allowOpenEnded: true,
        position: context.pos,
      });

      if (tag) {
        // the cursor is inside in a variable, card or snippet tag
        // do not complete identifiers here
        return null;
      }

      const word = context.matchBefore(/\w+/);
      if (!word) {
        return null;
      }

      const results = await getCardColumns();

      return {
        from: word.from,
        validFor(text: string) {
          return text.startsWith(word.text);
        },
        options: results.map(column => ({
          label: column.field.name,
          detail: `${column.card.name} :${column.field.base_type}`,
          boost: 50,
        })),
      };
    },
    [getCardColumns],
  );
}
