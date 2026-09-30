import type { Database } from "metabase-types/api";

import {
  type FormulaFunctionSpec,
  getFormulaFunctions,
} from "./formula-functions";

/** How many matches the list shows at once. With Metabase's full function
 * library behind it, a two-letter token can match a dozen names; showing
 * all of them turns the list into a wall. */
const MAX_SUGGESTIONS = 8;

export interface SuggestionContext {
  /** The letters-only token immediately before the cursor, e.g. "SU" in
   * "=SU|". Never empty — see getSuggestionContext. */
  token: string;
  /** Index the token starts at — where a matched function name gets
   * spliced in, replacing the token. */
  start: number;
}

/** Characters a function name can legitimately start after. */
const FUNCTION_START_CONTEXT = /[-+*/^(,=\s]/;

/**
 * Finds the function-name token being typed at `cursor`, or null when
 * suggestions don't belong here.
 *
 * Two rules, both matching Google Sheets:
 *  - Nothing is suggested until at least one letter is typed. A bare "="
 *    popping the whole function list open is noise.
 *  - The token must sit somewhere a function name could actually begin
 *    (after "=", an operator, "(", "," or whitespace). This rules out
 *    cell-reference context: the "s" in "=SUM(A11:s" follows a ":", and
 *    the letters in "A1s" follow a digit, so neither offers functions.
 */
export function getSuggestionContext(
  text: string,
  cursor: number,
): SuggestionContext | null {
  let start = cursor;
  while (start > 0 && /[A-Za-z]/.test(text[start - 1])) {
    start--;
  }
  const token = text.slice(start, cursor);
  if (token === "") {
    return null;
  }
  const charBefore = text[start - 1] ?? "";
  if (charBefore !== "" && !FUNCTION_START_CONTEXT.test(charBefore)) {
    return null;
  }
  return { token, start };
}

/** Supported functions whose name starts with whatever's being typed
 * (case-insensitively). Empty when suggestions don't apply here at all. */
export function getMatchingFunctions(
  text: string,
  cursor: number,
  database?: Database | null,
): FormulaFunctionSpec[] {
  const ctx = getSuggestionContext(text, cursor);
  if (!ctx) {
    return [];
  }
  const upper = ctx.token.toUpperCase();
  return (
    getFormulaFunctions(database)
      .filter((fn) => fn.name.startsWith(upper))
      // Locally-evaluated functions first: they fill the column instantly,
      // so when both match a prefix the cheaper one should be the default.
      .sort((a, b) => Number(b.isLocal) - Number(a.isLocal))
      .slice(0, MAX_SUGGESTIONS)
  );
}
