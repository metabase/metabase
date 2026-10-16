import type { Editor } from "@tiptap/core";
import { createContext, useContext } from "react";

import type {
  ConcreteTableId,
  ProductAnalyticsNodeDefinition,
} from "metabase-types/api";

import type { AnalysisKind } from "../spec/types";

export const ANALYSIS_PANEL_TABS = ["setup", "advanced", "insights"] as const;

export type AnalysisPanelTab = (typeof ANALYSIS_PANEL_TABS)[number];

export type AnalysisDocumentContextValue = {
  editor: Editor | null;
  /** Every analysis in the document reads this table. */
  tableId: ConcreteTableId | undefined;
  /** Every analysis in the document uses this date range. */
  dateRange: string;
  canWrite: boolean;
  /** The analysis in edit mode. At most one is. */
  editingNodeId: string | null;
  panelTab: AnalysisPanelTab | null;
  /** An analysis that was just added, briefly highlighted. */
  highlightedNodeId: string | null;
  startEditing: (nodeId: string, panelTab?: AnalysisPanelTab) => void;
  stopEditing: () => void;
  setPanelTab: (panelTab: AnalysisPanelTab | null) => void;
  /** Adds a new analysis at the cursor and opens its setup. */
  insertAnalysis: (kind: AnalysisKind) => void;
  /**
   * Adds an analysis below `sourceNodeId`, after anything added from it
   * before, and highlights it. Edit mode stays where it is.
   */
  insertAnalysisBelow: (
    sourceNodeId: string,
    definition: ProductAnalyticsNodeDefinition,
  ) => void;
};

const AnalysisDocumentContext =
  createContext<AnalysisDocumentContextValue | null>(null);

export const AnalysisDocumentProvider = AnalysisDocumentContext.Provider;

export const useAnalysisDocument = (): AnalysisDocumentContextValue => {
  const value = useContext(AnalysisDocumentContext);
  if (value === null) {
    throw new Error(
      "useAnalysisDocument must be used inside an AnalysisDocumentProvider",
    );
  }
  return value;
};
