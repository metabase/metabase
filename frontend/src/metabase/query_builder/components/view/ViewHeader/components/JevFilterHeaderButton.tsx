import { useCallback } from "react";

import { getUser } from "metabase/current-user";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { JevQuestionFilterPalette } from "metabase/querying/jev-filters";
import { useDispatch, useSelector } from "metabase/redux";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { updateQuestion } from "../../../../actions";

interface JevFilterHeaderButtonProps {
  question: Question;
}

/** "Filter with Jev" + Cmd/Ctrl+F palette; render where `FilterHeaderButton` renders. */
export function JevFilterHeaderButton({
  question,
}: JevFilterHeaderButtonProps) {
  const dispatch = useDispatch();
  const isLoggedIn = useSelector((state) => getUser(state) != null);

  const handleQueryChange = useCallback(
    (query: Lib.Query) => {
      dispatch(
        updateQuestion(question.setQuery(query), {
          run: true,
          shouldUpdateUrl: true,
        }),
      );
    },
    [dispatch, question],
  );

  if (!isLoggedIn || isEmbeddingSdk()) {
    return null;
  }

  return (
    <JevQuestionFilterPalette
      query={question.query()}
      questionName={
        question.isSaved() ? (question.displayName() ?? undefined) : undefined
      }
      onQueryChange={handleQueryChange}
    />
  );
}
