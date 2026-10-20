import { t } from "ttag";

import type { FilterDirection } from "../types";

import {
  AdvancedFilterModalButton,
  AdvancedFilterModalPrototype,
} from "./advanced-filter-modal/AdvancedFilterModalPrototype";
import {
  AdvancedWorksheetFilterButton,
  AdvancedWorksheetPrototype,
} from "./advanced-worksheet/AdvancedWorksheetPrototype";
import { AndOrTogglePrototype } from "./and-or-toggle/AndOrTogglePrototype";
import { BaselinePrototype } from "./baseline/BaselinePrototype";
import { ExpressionBarInlinePrototype } from "./expression-bar/ExpressionBarPrototype";
import { OrPillsPrototype } from "./or-pills/OrPillsPrototype";
import { QbeGridPrototype } from "./qbe-grid/QbeGridPrototype";
import { RailroadPrototype } from "./railroad/RailroadPrototype";

export const FILTER_DIRECTIONS: FilterDirection[] = [
  {
    id: "or-baseline",
    get name() {
      return t`Baseline`;
    },
    get description() {
      return t`Today's UI. An OR only exists as a custom expression and shows up as one pill.`;
    },
    Component: BaselinePrototype,
  },
  {
    id: "normalized-nested-form",
    get name() {
      return t`Normalized nested form`;
    },
    get description() {
      return t`Pills stay AND-ed at the top level. Click a pill to edit its OR rows in a dropdown.`;
    },
    Component: OrPillsPrototype,
  },
  {
    id: "or-advanced-worksheet",
    get name() {
      return t`Worksheet toggleable operators`;
    },
    get description() {
      return t`One "Advanced filter" pill opens a worksheet. Each group is a line; click its first connector to switch and/or. Subgroups nest up to three levels.`;
    },
    Component: AdvancedWorksheetPrototype,
    FilterButton: AdvancedWorksheetFilterButton,
  },
  {
    id: "expression-bar",
    get name() {
      return t`Expression bar`;
    },
    get description() {
      return t`Expression bar with Cancel and Apply inside the bar. The header button hides and shows the filter strip.`;
    },
    Component: ExpressionBarInlinePrototype,
    canHideFilters: true,
  },
  {
    id: "advanced-filter-modal",
    get name() {
      return t`Advanced filter modal with expression bar`;
    },
    get description() {
      return t`Today's pills and notebook step. The filter picker ends with "Advanced filter", which opens the expression bar in a modal.`;
    },
    Component: AdvancedFilterModalPrototype,
    FilterButton: AdvancedFilterModalButton,
  },
  {
    id: "railroad",
    get name() {
      return t`Railroad tracks`;
    },
    get description() {
      return t`Filters drawn as tracks. Series = and, parallel tracks = or; any left-to-right path through the diagram is a matching row.`;
    },
    Component: RailroadPrototype,
  },
  {
    id: "and-or-toggle",
    get name() {
      return t`AND/OR toggle in the bar`;
    },
    get description() {
      return t`Today's pills, joined by one unshown operator. The segmented control on the right switches between matching all filters (AND) and any filter (OR).`;
    },
    Component: AndOrTogglePrototype,
  },
  {
    id: "qbe-grid",
    get name() {
      return t`Query-by-example grid`;
    },
    get description() {
      return t`Columns are data columns, rows are segments joined by or, cells on a row are and-ed. Duplicate a row to build the next segment.`;
    },
    Component: QbeGridPrototype,
  },
];
