import { t } from "ttag";

import type { FilterDirection } from "../types";

import { ExpressionBarInline2Prototype } from "./expression-bar-2/ExpressionBarPrototype";

/**
 * Iteration 2 directions: the next round, built on what iteration 1 taught us. Iteration 1
 * stays in `./index.ts` untouched so both rounds remain clickable side by side.
 */
export const ITERATION_2_DIRECTIONS: FilterDirection[] = [
  {
    id: "expression-bar-inline-2",
    get name() {
      return t`Expression bar A`;
    },
    get description() {
      return t`Iteration 2 copy of the expression bar. One bar for the whole expression. Pick filters from a dropdown; type "and", "or" and parentheses between them. Cancel and Apply sit in the bar; the header button hides and shows the strip.`;
    },
    Component: ExpressionBarInline2Prototype,
    canHideFilters: true,
  },
];
