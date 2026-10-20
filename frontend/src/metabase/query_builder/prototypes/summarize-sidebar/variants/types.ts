import type { ComponentType } from "react";

import type Question from "metabase-lib/v1/Question";

/** The contract every variant's sidebar implements, the same one the query builder gives `SummarySidebar`. */
export type SummarizeSidebarVariantProps = {
  question: Question;
  onQuestionChange: (question: Question) => void;
};

export type SummarizeSidebarVariant = {
  /** The variant's URL segment. Links depend on it, so it never changes once shared. */
  slug: string;
  name: string;
  /** The design direction this variant explores, in a phrase. */
  axis: string;
  Sidebar: ComponentType<SummarizeSidebarVariantProps>;
};
