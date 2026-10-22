import type { ComponentType } from "react";

import type Question from "metabase-lib/v1/Question";

import type { SummaryExpression } from "../../components/view/SummarySidebar/types";

/** A custom aggregation the seed controls can add to the summary, written as the formula editor takes it. */
export type SeedFormula = {
  name: string;
  source: string;
  /** What the formula reveals about the data, in a sentence. */
  description: string;
};

/** The contract every variant's sidebar implements, the same one the query builder gives `SummarySidebar`. */
export type SidebarPrototypeVariantProps = {
  question: Question;
  onQuestionChange: (question: Question) => void;
  /**
   * Values the seed controls asked to add. Each new array is added once, so seeding the same
   * formulas twice passes a new array. Variants that don't support seeding ignore it.
   */
  seededValues?: readonly SummaryExpression[] | null;
  /**
   * An empty element spanning the top of the workspace, above the results and the sidebar, for a
   * variant to portal into, e.g. a spreadsheet-style formula bar. `null` until it mounts.
   */
  workspaceTopSlot?: HTMLElement | null;
};

export type SidebarPrototypeVariant = {
  /** The variant's URL segment. Links depend on it, so it never changes once shared. */
  slug: string;
  name: string;
  /** The design direction this variant explores, in a phrase. */
  axis: string;
  Sidebar: ComponentType<SidebarPrototypeVariantProps>;
};
