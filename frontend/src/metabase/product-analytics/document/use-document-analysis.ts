import { useCallback, useMemo } from "react";

import type { ProductAnalyticsNodeDefinition } from "metabase-types/api";

import type { StoredSettings } from "../settings/types";
import { useAnalysis } from "../use-analysis";

import { useAnalysisDocument } from "./AnalysisDocumentContext";
import { updateAnalysisNodeSettings } from "./analysis-node-utils";

type UseDocumentAnalysisArgs = {
  nodeId: string;
  definition: ProductAnalyticsNodeDefinition;
  /** Nothing loads until enabled. */
  isEnabled: boolean;
};

/**
 * Runs the analysis a document node holds, with the document's table. Its date
 * range is its own when set, or the document's. Setting changes are written to
 * the node, so they can be undone.
 */
export const useDocumentAnalysis = ({
  nodeId,
  definition,
  isEnabled,
}: UseDocumentAnalysisArgs) => {
  const { editor, tableId, dateRange } = useAnalysisDocument();
  const stored = useMemo(
    () => ({ date_range: dateRange, ...definition.settings }),
    [definition.settings, dateRange],
  );
  const handleChangeSettings = useCallback(
    (changes: StoredSettings) => {
      if (editor !== null) {
        updateAnalysisNodeSettings(editor, nodeId, changes);
      }
    },
    [editor, nodeId],
  );
  return useAnalysis({
    kind: definition.kind,
    tableId: isEnabled ? tableId : undefined,
    stored,
    onChangeSettings: handleChangeSettings,
  });
};
