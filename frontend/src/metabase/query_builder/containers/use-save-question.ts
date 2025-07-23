import { useCallback } from "react";

import type { ScheduleCallback } from "metabase/common/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import type Question from "metabase-lib/v1/Question";

import { apiUpdateQuestion } from "../actions/core/core";
import { setUIControls } from "../actions/ui";
import { updateUrl } from "../actions/url";

interface UseSaveQuestionParams {
  scheduleCallback?: ScheduleCallback;
}

type UseSaveQuestionResult = (
  question: Question,
  config?: { rerunQuery?: boolean },
) => Promise<void>;

export function useSaveQuestion({
  scheduleCallback,
}: UseSaveQuestionParams = {}): UseSaveQuestionResult {
  const dispatch = useDispatch();

  return useCallback(
    async (updatedQuestion: Question, { rerunQuery } = {}) => {
      await dispatch(apiUpdateQuestion(updatedQuestion, { rerunQuery }));
      await dispatch(setUIControls({ isModifiedFromNotebook: false }));

      scheduleCallback?.(async () => {
        if (!rerunQuery) {
          await dispatch(updateUrl(updatedQuestion, { dirty: false }));
        }
      });
    },
    [dispatch, scheduleCallback],
  );
}
