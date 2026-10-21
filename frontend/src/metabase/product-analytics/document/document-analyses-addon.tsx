import { useEditorState } from "@tiptap/react";
import { t } from "ttag";

import type {
  DocumentPageAddon,
  UseDocumentPageAddon,
} from "metabase/documents/routes";
import { Box } from "metabase/ui";
import { getProductAnalyticsDocumentContext } from "metabase-types/guards";

import { ANALYSIS_KINDS, getAnalysisConfig } from "../analyses/config";
import { DEFAULT_DATE_RANGE } from "../date-range";
import { usePrototypeTable } from "../use-prototype-table";

import { AnalysisDocumentProvider } from "./AnalysisDocumentContext";
import { AnalysisSidePanel } from "./AnalysisSidePanel";
import { findAnalysisNode } from "./analysis-node-utils";
import { readDocumentContext } from "./document-context";
import {
  ANALYSIS_DOCUMENT_EXTENSIONS,
  ANALYSIS_ICONS,
  useEventAnalysisCommands,
} from "./editor-host";
import { useAnalysisDocumentState } from "./use-analysis-document-state";

const DOCUMENT_EDITOR_HOST: DocumentPageAddon["hostOverride"] = {
  useEventAnalysisCommands,
};

/**
 * Event analyses inside a document. Unlike an analysis document, a plain document
 * has no table or date-range pickers: its analyses read the prototype events
 * table over the default range unless the saved document says otherwise.
 */
export const useDocumentAnalysesAddon: UseDocumentPageAddon = ({
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

  const startActions: DocumentPageAddon["startActions"] = [
    {
      key: "event-analysis",
      label: t`New event analysis`,
      icon: "funnel",
      options: ANALYSIS_KINDS.map((kind) => ({
        key: kind,
        label: getAnalysisConfig(kind).name,
        icon: ANALYSIS_ICONS[kind],
        onSelect: () => state.insertAnalysis(kind),
      })),
    },
  ];

  return {
    startActions,
    extraExtensions: ANALYSIS_DOCUMENT_EXTENSIONS,
    hostOverride: DOCUMENT_EDITOR_HOST,
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
