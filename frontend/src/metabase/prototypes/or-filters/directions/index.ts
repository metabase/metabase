import { t } from "ttag";

import type { FilterDirection } from "../types";

import {
  AdvancedWorksheetFilterButton,
  AdvancedWorksheetPrototype,
} from "./advanced-worksheet/AdvancedWorksheetPrototype";
import { BaselinePrototype } from "./baseline/BaselinePrototype";
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
    id: "or-advanced-worksheet",
    get name() {
      return t`Visual nesting in a big worksheet: rows`;
    },
    get description() {
      return t`One "Advanced filter" pill opens a worksheet. Each group is a line; click its first connector to switch and/or. Subgroups nest up to three levels.`;
    },
    Component: AdvancedWorksheetPrototype,
    FilterButton: AdvancedWorksheetFilterButton,
  },
];
