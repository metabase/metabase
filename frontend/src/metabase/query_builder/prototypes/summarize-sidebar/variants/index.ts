import { SummarySidebar } from "../../../components/view/SummarySidebar";

import { SummarySidebar as AiFormulaSummarySidebar } from "./ai-formula";
import { SummarySidebar as BreakoutsSummarySidebar } from "./breakouts";
import { SummarySidebar as ClickToSwapSummarySidebar } from "./click-to-swap";
import { SummarySidebar as OriginalSummarySidebar } from "./original";
import { SummarySidebar as RoomySummarySidebar } from "./roomy";
import { SummarySidebar as RowsOnDemandSummarySidebar } from "./rows-on-demand";
import { SummarySidebar as SectionsSummarySidebar } from "./sections";
import { SummarySidebar as SectionsTopSummarySidebar } from "./sections-top";
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
    axis: "As shipped in the query builder: Sections swap",
    Sidebar: SummarySidebar,
  },
  {
    slug: "original",
    name: "Original",
    axis: "The query builder's sidebar before Sections swap: fields on top, wells below",
    Sidebar: OriginalSummarySidebar,
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
    slug: "breakouts",
    name: "Breakouts",
    axis: "Add rows, worded for charts: Values and Breakouts; Pivot adds Rows and renames Breakouts to Columns",
    Sidebar: BreakoutsSummarySidebar,
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
  {
    slug: "click-to-swap",
    name: "Click to swap",
    axis: "Wells left, from Count of rows: a click swaps the breakout, ⌥-click or a drag adds one, a drag below Breakouts pivots",
    Sidebar: ClickToSwapSummarySidebar,
  },
  {
    slug: "sections",
    name: "Sections",
    axis: "No tabs: one list with Metrics on top and a collapsible section per table",
    Sidebar: SectionsSummarySidebar,
  },
  {
    slug: "sections-top",
    name: "Sections top",
    axis: "Sections' field list with Breakouts' wells, wells on top",
    Sidebar: SectionsTopSummarySidebar,
  },
  {
    slug: "sections-swap",
    name: "Sections swap",
    axis: "Click to swap with Sections' field list; now shipped in the query builder, the same sidebar as Default",
    Sidebar: SummarySidebar,
  },
  {
    slug: "ai-formula",
    name: "AI formula",
    axis: "Sections swap, plus AI: Enter on text that matches nothing writes a formula, ✨ on a chip changes it, and the bottom bar builds a whole summary",
    Sidebar: AiFormulaSummarySidebar,
  },
];
