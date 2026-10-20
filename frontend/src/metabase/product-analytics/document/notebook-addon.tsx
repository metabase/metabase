import { useEditorState } from "@tiptap/react";

import type {
  DocumentPageAddon,
  UseDocumentPageAddon,
} from "metabase/documents/routes";
import { Box } from "metabase/ui";
import { getProductAnalyticsDocumentContext } from "metabase-types/guards";

import { DEFAULT_DATE_RANGE } from "../date-range";
import { usePrototypeTable } from "../use-prototype-table";

import { AnalysisDocumentProvider } from "./AnalysisDocumentContext";
import { AnalysisSidePanel } from "./AnalysisSidePanel";
import { findAnalysisNode } from "./analysis-node-utils";
import { readDocumentContext } from "./document-context";
import {
  ANALYSIS_DOCUMENT_EXTENSIONS,
  useEventAnalysisCommands,
} from "./editor-host";
import { useAnalysisDocumentState } from "./use-analysis-document-state";

const NOTEBOOK_EDITOR_HOST: DocumentPageAddon["hostOverride"] = {
  useEventAnalysisCommands,
};

/**
 * Event analyses inside a notebook. Unlike an analysis document, a notebook
 * has no table or date-range pickers: its analyses read the prototype events
 * table over the default range unless the saved document says otherwise.
 */
export const useNotebookAnalysesAddon: UseDocumentPageAddon = ({
  editor,
  canWrite,
  savedContent,
}) => {
  const prototype = usePrototypeTable();
  const editorContext = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor !== null ? readDocumentContext(editor.state.doc) : undefined,
  });
  const documentContext =
    editorContext ?? getProductAnalyticsDocumentContext(savedContent);

  const state = useAnalysisDocumentState({
    editor,
    tableId: documentContext?.table_id ?? prototype.tableId,
    dateRange: documentContext?.date_range ?? DEFAULT_DATE_RANGE,
    canWrite,
  });

  const editingDefinition = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor !== null && state.editingNodeId !== null
        ? findAnalysisNode(editor.state.doc, state.editingNodeId)?.definition
        : undefined,
  });

  const sidePanel =
    state.editingNodeId !== null &&
    state.panelTab !== null &&
    editingDefinition != null
      ? {
          nodeId: state.editingNodeId,
          definition: editingDefinition,
          panelTab: state.panelTab,
        }
      : null;

  return {
    extraExtensions: ANALYSIS_DOCUMENT_EXTENSIONS,
    hostOverride: NOTEBOOK_EDITOR_HOST,
    wrap: (children) => (
      <AnalysisDocumentProvider value={state}>
        {children}
      </AnalysisDocumentProvider>
    ),
    sidePanel: sidePanel !== null && (
      <Box h="100%" style={{ flexShrink: 0 }}>
        <AnalysisSidePanel key={sidePanel.nodeId} {...sidePanel} />
      </Box>
    ),
  };
};
