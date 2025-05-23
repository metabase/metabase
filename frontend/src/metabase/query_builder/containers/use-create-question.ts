import { useCallback } from "react";

import type { ScheduleCallback } from "metabase/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import {
  apiCreateQuestion,
  setUIControls,
  updateUrl,
} from "metabase/query_builder/actions";
import type Question from "metabase-lib/v1/Question";
import type { DashboardTabId } from "metabase-types/api";

type OnCreateOptions = { dashboardTabId?: DashboardTabId | undefined };

interface UseCreateQuestionParams {
  scheduleCallback?: ScheduleCallback;
}

export const useCreateQuestion = ({
  scheduleCallback,
}: UseCreateQuestionParams = {}) => {
  const dispatch = useDispatch();

  return useCallback(
    async (newQuestion: Question, options?: OnCreateOptions) => {
      const shouldBePinned =
        newQuestion.type() === "model" || newQuestion.type() === "metric";
      const createdQuestion = await dispatch(
        apiCreateQuestion(newQuestion.setPinned(shouldBePinned), options),
      );
      await dispatch(setUIControls({ isModifiedFromNotebook: false }));

      scheduleCallback?.(async () => {
        await dispatch(updateUrl(createdQuestion, { dirty: false }));
      });

      return createdQuestion;
    },
    [dispatch, scheduleCallback],
  );
};
