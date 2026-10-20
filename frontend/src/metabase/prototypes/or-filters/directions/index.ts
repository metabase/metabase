import { t } from "ttag";

import type { FilterDirection } from "../types";

import { BaselinePrototype } from "./baseline/BaselinePrototype";
import { ExpressionBarPrototype } from "./expression-bar/ExpressionBarPrototype";
import { OrPillsPrototype } from "./or-pills/OrPillsPrototype";

export const FILTER_DIRECTIONS: FilterDirection[] = [
  {
    id: "or-baseline",
    get name() {
      return t`OR filters: Baseline`;
    },
    get description() {
      return t`Today's UI. An OR only exists as a custom expression and shows up as one pill.`;
    },
    Component: BaselinePrototype,
  },
  {
    id: "or-pills",
    get name() {
      return t`OR filters A: OR inside pills`;
    },
    get description() {
      return t`Pills stay AND-ed at the top level. Click a pill to edit its OR rows in a dropdown.`;
    },
    Component: OrPillsPrototype,
  },
  {
    id: "expression-bar",
    get name() {
      return t`OR filters B: Expression bar`;
    },
    get description() {
      return t`One bar for the whole expression. Pick filters from a dropdown; type "and", "or" and parentheses between them.`;
    },
    Component: ExpressionBarPrototype,
  },
];
