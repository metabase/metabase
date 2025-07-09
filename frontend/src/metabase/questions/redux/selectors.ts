import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase-types/store";
import type { GenerativeQuestion } from "metabase-types/store/generativeQuestions";

export const getGenerativeQuestionsState = (state: State) => state.generativeQuestions;

export const getGenerativeQuestions = createSelector(
  [getGenerativeQuestionsState],
  (state) => state.questions,
);

export const getGenerativeQuestionById = createSelector(
  [getGenerativeQuestions, (_state: State, id: string) => id],
  (questions, id) => questions[id],
);

export const getGenerativeQuestionsList = createSelector(
  [getGenerativeQuestions],
  (questions: Record<string, GenerativeQuestion>): GenerativeQuestion[] =>
    Object.values(questions).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
);

export const getGenerativeQuestionsLoading = createSelector(
  [getGenerativeQuestionsState],
  (state) => state.loading,
);

export const getGenerativeQuestionsError = createSelector(
  [getGenerativeQuestionsState],
  (state) => state.error,
);
