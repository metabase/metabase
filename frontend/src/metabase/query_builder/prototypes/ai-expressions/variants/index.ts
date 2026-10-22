import type { SidebarPrototypeVariant } from "../../shared/types";

import { SummarySidebar as AiFormulaSummarySidebar } from "./ai-formula";
import { SummarySidebar as AnchoredEditorSummarySidebar } from "./anchored-editor";
import { SummarySidebar as FormulaBarSummarySidebar } from "./formula-bar";
import { SummarySidebar as LivePreviewSummarySidebar } from "./live-preview";
import { SummarySidebar as PointModeSummarySidebar } from "./point-mode";

/**
 * The variants, in picker order. To add one, copy the UI files of an existing variant (or of
 * `components/view/SummarySidebar`, everything but `types`, `utils`, and `summary-session`, which
 * stay shared) into `variants/<slug>/` and append an entry here.
 */
export const VARIANTS: readonly SidebarPrototypeVariant[] = [
  {
    slug: "ai-formula",
    name: "AI formula",
    axis: "Sections swap, plus: text that matches nothing in a well is a description, and Enter has AI write the formula",
    Sidebar: AiFormulaSummarySidebar,
  },
  {
    slug: "formula-bar",
    name: "Formula bar",
    axis: "A spreadsheet formula bar across the top of the workspace edits formulas; the well holds a placeholder chip",
    Sidebar: FormulaBarSummarySidebar,
  },
  {
    slug: "anchored-editor",
    name: "Anchored editor",
    axis: "A placeholder chip in the well, edited in a wide editor floating just below it",
    Sidebar: AnchoredEditorSummarySidebar,
  },
  {
    slug: "point-mode",
    name: "Point mode",
    axis: "Edit in place in the chip; clicking a column or metric while editing inserts it, colored like its reference",
    Sidebar: PointModeSummarySidebar,
  },
  {
    slug: "live-preview",
    name: "Live preview",
    axis: "Every valid keystroke recalculates the results; Enter keeps the formula, Esc puts the summary back",
    Sidebar: LivePreviewSummarySidebar,
  },
];
