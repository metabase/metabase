import type { NewQuestionType } from "./types";

const STORAGE_KEY = "metabase-notebook-last-query-type";

const NEW_QUESTION_TYPES: readonly NewQuestionType[] = [
  "ai",
  "event-analysis",
  "notebook",
  "native",
];

const isNewQuestionType = (value: unknown): value is NewQuestionType =>
  NEW_QUESTION_TYPES.some((type) => type === value);

export const getLastQueryType = (): NewQuestionType | null => {
  const value: unknown = window.localStorage.getItem(STORAGE_KEY);
  return isNewQuestionType(value) ? value : null;
};

export const setLastQueryType = (type: NewQuestionType) => {
  window.localStorage.setItem(STORAGE_KEY, type);
};
