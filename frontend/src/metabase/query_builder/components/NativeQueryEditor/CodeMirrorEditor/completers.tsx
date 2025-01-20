import type { CompletionContext } from "@codemirror/autocomplete";
import { useCallback } from "react";
import slugg from "slugg";
import { t } from "ttag";

import {
  useLazyGetAutocompleteSuggestionsQuery,
  useLazyGetCardAutocompleteSuggestionsQuery,
  useLazyGetCardQuery,
  useListSnippetsQuery,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { isNotNull } from "metabase/lib/types";
import type { Card, CardId, DatabaseId, Field } from "metabase-types/api";

import { getCardAutocompleteResultMeta, matchTagAtCursor } from "./util";

// Keep this in sync with the limit in the backend code at
// `autocomplete-suggestions` in src/metabase/api/database.clj
const AUTOCOMPLETE_SUGGESTIONS_LIMIT = 50;

type SchemaCompletionOptions = {
  databaseId?: DatabaseId | null;
};

function matchAfter(context: CompletionContext, expr: RegExp) {
  const line = context.state.doc.lineAt(context.pos);
  const str = line.text.slice(context.pos - line.from);
  const found = str.search(expr);
  if (found < 0) {
    return null;
  }

  const text = str.slice(found);
  return {
    from: context.pos,
    to: context.pos + text.length,
    text,
  };
}

// Completes column and table names from the database schema
export function useSchemaCompletion({ databaseId }: SchemaCompletionOptions) {
  const matchStyle = useSetting("native-query-autocomplete-match-style");

  const [getAutocompleteSuggestions] = useLazyGetAutocompleteSuggestionsQuery();

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
        // the cursor is inside a variable, card or snippet tag
        // do not complete identifiers here
        return null;
      }

      const word = context.matchBefore(/\w+/);
      if (!word) {
        return null;
      }

      const suffix = matchAfter(context, /\w+/);

      // Do not cache this in the rtk-query's cache, since there is no
      // way to invalidate it. The autocomplete endpoint set caching headers
      // so the request should be cached in the browser.
      const shouldCache = false;

      const { data } = await getAutocompleteSuggestions(
        { databaseId, matchStyle, query: word.text.trim() },
        shouldCache,
      );
      if (!data) {
        return null;
      }

      const seen = new Set();

      const deduped = data.filter(([value]) => {
        if (seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });

      return {
        from: word.from,
        to: suffix?.to,
        options: deduped.map(([value, meta]) => ({
          label: value,
          detail: meta,
        })),
        validFor(text: string) {
          if (data.length >= AUTOCOMPLETE_SUGGESTIONS_LIMIT) {
            // If there are more suggestions than the limit, we want subsequent
            // edits to fetch more completions because we can't assume that we've seen all
            // suggestions
            return false;
          }

          return text.startsWith(word.text);
        },
      };
    },
    [databaseId, matchStyle, getAutocompleteSuggestions],
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
        to: tag.content.to,
        options: results.map(snippet => ({
          label: snippet.name,
          apply: tag.hasClosingTag ? snippet.name : `${snippet.name} }}`,
          detail: t`Snippet`,
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
  const [getCardAutocompleteSuggestions] =
    useLazyGetCardAutocompleteSuggestionsQuery();
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

      // Do not cache this in the rtk-query's cache, since there is no
      // way to invalidate it. The autocomplete endpoint set caching headers
      // so the request should be cached in the browser.
      const shouldCache = false;

      const { data } = await getCardAutocompleteSuggestions(
        {
          databaseId,
          query,
        },
        shouldCache,
      );
      if (!data) {
        return null;
      }

      return {
        // -1 because we want to include the # in the autocomplete
        from: tag.content.from - 1,
        to: tag.content.to,
        options: data.map(({ id, name, type, collection_name }) => ({
          label: `#${id}-${slugg(name)}`,
          detail: getCardAutocompleteResultMeta(type, collection_name),
          apply: tag.hasClosingTag
            ? `#${id}-${slugg(name)}`
            : `#${id}-${slugg(name)} }}`,
        })),
        validFor(text: string) {
          if (data.length >= AUTOCOMPLETE_CARD_SUGGESTIONS_LIMIT) {
            // If there are more suggestions than the limit, we want subsequent
            // edits to fetch more completions because we can't assume that we've seen all
            // suggestions
            return false;
          }
          return text.startsWith(`#${query}`);
        },
      };
    },
    [databaseId, getCardAutocompleteSuggestions],
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
    const shouldCache = true;
    const data = await Promise.all(
      referencedQuestionIds.map(id => getCard({ id }, shouldCache)),
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
        })),
      };
    },
    [getCardColumns],
  );
}
