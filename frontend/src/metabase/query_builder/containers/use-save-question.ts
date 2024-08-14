import { useCallback } from "react";

import type { ScheduleCallback } from "metabase/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import {
  apiUpdateQuestion,
  setUIControls,
  updateUrl,
} from "metabase/query_builder/actions";
import type Question from "metabase-lib/v1/Question";

interface UseSaveQuestionParams {
  scheduleCallback: ScheduleCallback;
}

type UseSaveQuestionResult = (
  question: Question,
  config?: { rerunQuery?: boolean },
) => Promise<void>;

export function useSaveQuestion({
  scheduleCallback,
}: UseSaveQuestionParams): UseSaveQuestionResult {
  const dispatch = useDispatch();

  return useCallback(
    async (
      updatedQuestion: Question,
      { rerunQuery }: { rerunQuery?: boolean } = {},
    ) => {
      await dispatch(apiUpdateQuestion(updatedQuestion, { rerunQuery }));
      await dispatch(setUIControls({ isModifiedFromNotebook: false }));

      scheduleCallback(async () => {
        if (!rerunQuery) {
          await dispatch(updateUrl(updatedQuestion, { dirty: false }));
        }
      });
    },
    [dispatch, scheduleCallback],
  );
}
