import type { SidebarPrototypeVariant } from "../../shared/types";

import { SummarySidebar as AiFormulaSummarySidebar } from "./ai-formula";

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
];
