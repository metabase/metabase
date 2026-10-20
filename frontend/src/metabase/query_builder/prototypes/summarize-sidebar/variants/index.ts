import { SummarySidebar } from "../../../components/view/SummarySidebar";

import type { SummarizeSidebarVariant } from "./types";

/**
 * The variants, in picker order. To add one, fork `components/view/SummarySidebar` into
 * `variants/<slug>/` and append an entry here; `default` stays the sidebar the query builder ships.
 */
export const VARIANTS: readonly SummarizeSidebarVariant[] = [
  {
    slug: "default",
    name: "Default",
    axis: "Card-based pivot builder, as shipped in the query builder",
    Sidebar: SummarySidebar,
  },
];
