import { createContext } from "react";

/** What parts the filters on the rows from the filters on the summary. */
export const STAGE_SEPARATORS = [
  "dash",
  "arrow",
  "chevron",
  "guillemet",
  "hairline",
  "then",
] as const;

export type StageSeparator = (typeof STAGE_SEPARATORS)[number];

export const StageSeparatorContext = createContext<StageSeparator>("dash");

export function isStageSeparator(value: string): value is StageSeparator {
  return STAGE_SEPARATORS.some((separator) => separator === value);
}
