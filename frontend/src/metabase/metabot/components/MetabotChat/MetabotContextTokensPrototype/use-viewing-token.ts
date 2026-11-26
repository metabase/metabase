// PROTOTYPE: metabot context tokens
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  type ChatContextFilterFn,
  useRegisterMetabotContextFilter,
} from "metabase/metabot";
// eslint-disable-next-line boundaries/element-types -- PROTOTYPE: unsaved-question name lives only in QB state
import { getQuestion } from "metabase/query_builder";
import { useSelector } from "metabase/redux";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { useLocation } from "metabase/router";
import { extractEntityId } from "metabase/urls";

import { type ContextToken, getTokenKey, isViewingContextFor } from "./tokens";

const SAVED_ENTITY_ROUTES: { pattern: RegExp; model: SuggestionModel }[] = [
  { pattern: /^\/question\/(\d+)/, model: "card" },
  { pattern: /^\/model\/(\d+)/, model: "dataset" },
  { pattern: /^\/metric\/(\d+)/, model: "metric" },
  { pattern: /^\/dashboard\/(\d+)/, model: "dashboard" },
  { pattern: /^\/document\/(\d+)/, model: "document" },
  { pattern: /^\/table\/(\d+)/, model: "table" },
];

const UNSAVED_QUESTION_ROUTE = /^\/question(\/notebook)?\/?$/;

function useViewedEntityToken(): ContextToken | null {
  const { pathname } = useLocation();
  const isUnsavedQuestion = UNSAVED_QUESTION_ROUTE.test(pathname);
  const question = useSelector(getQuestion);
  const unsavedQuestionName = isUnsavedQuestion
    ? (question?.displayName() ?? t`Unsaved question`)
    : undefined;
  const unsavedQuestionDisplay = isUnsavedQuestion
    ? question?.display()
    : undefined;

  return useMemo(() => {
    if (unsavedQuestionName != null) {
      return {
        key: getTokenKey("card", null),
        source: "viewing",
        model: "card",
        id: null,
        label: unsavedQuestionName,
        display: unsavedQuestionDisplay,
      };
    }

    for (const { pattern, model } of SAVED_ENTITY_ROUTES) {
      const id = extractEntityId(pathname.match(pattern)?.[1]);
      if (id != null) {
        return { key: getTokenKey(model, id), source: "viewing", model, id };
      }
    }
    return null;
  }, [pathname, unsavedQuestionName, unsavedQuestionDisplay]);
}

/**
 * The token for whatever the user is looking at, until they dismiss it.
 * Dismissing also drops the entity from the context Metabot receives.
 * Navigating to another entity (or back) brings the token back.
 */
export function useViewingToken() {
  const token = useViewedEntityToken();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState(token?.key);
  if (lastKey !== token?.key) {
    setLastKey(token?.key);
    setDismissedKey(null);
  }

  const dismiss = useCallback(() => {
    setDismissedKey(token?.key ?? null);
  }, [token?.key]);

  const dismissedToken = token && token.key === dismissedKey ? token : null;
  const excludeDismissedToken = useMemo<ChatContextFilterFn | null>(
    () =>
      dismissedToken
        ? (ctx) => ({
            ...ctx,
            user_is_viewing: ctx.user_is_viewing.filter(
              (item) => !isViewingContextFor(dismissedToken, item),
            ),
          })
        : null,
    [dismissedToken],
  );
  useRegisterMetabotContextFilter(excludeDismissedToken);

  return {
    viewingToken: dismissedToken ? null : token,
    dismissViewingToken: dismiss,
  };
}
