import { SummarySidebar } from "../../../components/view/SummarySidebar";

import { SummarySidebar as RoomySummarySidebar } from "./roomy";
import { SummarySidebar as RowsOnDemandSummarySidebar } from "./rows-on-demand";
import { SummarySidebar as SideBySideSummarySidebar } from "./side-by-side";
import type { SummarizeSidebarVariant } from "./types";
import { SummarySidebar as WellsLeftSummarySidebar } from "./wells-left";
import { SummarySidebar as WellsTopSummarySidebar } from "./wells-top";

/**
 * The variants, in picker order. To add one, copy the UI files of `components/view/SummarySidebar`
 * (everything but `types`, `utils`, and `summary-session`, which stay shared) into
 * `variants/<slug>/` and append an entry here; `default` stays the sidebar the query builder ships.
 */
export const VARIANTS: readonly SummarizeSidebarVariant[] = [
  {
    slug: "default",
    name: "Default",
    axis: "Fields on top, wells below, as shipped in the query builder",
    Sidebar: SummarySidebar,
  },
  {
    slug: "wells-top",
    name: "Wells on top",
    axis: "Wells on top, fields below",
    Sidebar: WellsTopSummarySidebar,
  },
  {
    slug: "roomy",
    name: "Roomy",
    axis: "Same layout, padded out and calmer",
    Sidebar: RoomySummarySidebar,
  },
  {
    slug: "rows-on-demand",
    name: "Add rows",
    axis: "Values and Columns to start; a button adds the Rows well",
    Sidebar: RowsOnDemandSummarySidebar,
  },
  {
    slug: "side-by-side",
    name: "Side by side",
    axis: "Fields on the left, wells on the right",
    Sidebar: SideBySideSummarySidebar,
  },
  {
    slug: "wells-left",
    name: "Wells left",
    axis: "Wells on the left, fields on the right",
    Sidebar: WellsLeftSummarySidebar,
  },
];
