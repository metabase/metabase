import type { Editor } from "@tiptap/core";
import { NodeSelection, type Transaction } from "@tiptap/pm/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ConcreteTableId,
  ProductAnalyticsNodeDefinition,
} from "metabase-types/api";

import type { AnalysisKind } from "../spec/types";

import type {
  AnalysisDocumentContextValue,
  AnalysisPanelTab,
} from "./AnalysisDocumentContext";
import {
  findAnalysisNode,
  getAnalysisNodeId,
  insertAnalysisNodeAfter,
  insertAnalysisNodeAtSelection,
} from "./analysis-node-utils";

const HIGHLIGHT_DURATION_MS = 2000;

type UseAnalysisDocumentStateArgs = {
  editor: Editor | null;
  tableId: ConcreteTableId | undefined;
  dateRange: string;
  canWrite: boolean;
};

const isSelectingNode = (editor: Editor, nodeId: string): boolean => {
  const { selection } = editor.state;
  return (
    selection instanceof NodeSelection &&
    getAnalysisNodeId(selection.node) === nodeId
  );
};

const scrollNodeIntoView = (editor: Editor, nodeId: string) => {
  const found = findAnalysisNode(editor.state.doc, nodeId);
  const element =
    found !== undefined ? editor.view.nodeDOM(found.pos) : undefined;
  if (element instanceof HTMLElement) {
    element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
};

/**
 * Edit mode and inserting analyses. Edit mode ends when the selection moves
 * off the analysis, on Escape in the document, or through `stopEditing`.
 * Clicks outside the editor, like in the side panel, keep it.
 */
export const useAnalysisDocumentState = ({
  editor,
  tableId,
  dateRange,
  canWrite,
}: UseAnalysisDocumentStateArgs): AnalysisDocumentContextValue => {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [panelTab, setPanelTabState] = useState<AnalysisPanelTab | null>(null);
  const [insightsTransition, setInsightsTransition] = useState<number | null>(
    null,
  );
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(
    null,
  );
  const lastInsertedBelowRef = useRef(new Map<string, string>());

  const setPanelTab = useCallback((nextPanelTab: AnalysisPanelTab | null) => {
    setPanelTabState(nextPanelTab);
    setInsightsTransition(null);
  }, []);

  const startEditing = useCallback(
    (nodeId: string, nextPanelTab?: AnalysisPanelTab) => {
      setEditingNodeId(nodeId);
      setInsightsTransition(null);
      if (nextPanelTab !== undefined) {
        setPanelTabState(nextPanelTab);
      }
    },
    [],
  );

  const stopEditing = useCallback(() => {
    setEditingNodeId(null);
    setInsightsTransition(null);
  }, []);

  const showInsights = useCallback(
    (nodeId: string, transition?: number) => {
      startEditing(nodeId, "insights");
      setInsightsTransition(transition ?? null);
    },
    [startEditing],
  );

  useEffect(() => {
    if (editor === null || editingNodeId === null) {
      return;
    }
    const handleTransaction = ({
      transaction,
    }: {
      transaction: Transaction;
    }) => {
      const isSelectionMove =
        transaction.selectionSet && !transaction.docChanged;
      if (isSelectionMove && !isSelectingNode(editor, editingNodeId)) {
        stopEditing();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const isInDocument =
        event.target === document.body ||
        (event.target instanceof Node &&
          editor.view.dom.contains(event.target));
      if (event.key === "Escape" && isInDocument) {
        stopEditing();
      }
    };
    editor.on("transaction", handleTransaction);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      editor.off("transaction", handleTransaction);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, editingNodeId, stopEditing]);

  useEffect(() => {
    if (highlightedNodeId === null) {
      return;
    }
    const timeout = setTimeout(
      () => setHighlightedNodeId(null),
      HIGHLIGHT_DURATION_MS,
    );
    return () => clearTimeout(timeout);
  }, [highlightedNodeId]);

  const insertAnalysis = useCallback(
    (kind: AnalysisKind) => {
      if (editor === null || !canWrite) {
        return;
      }
      const nodeId = insertAnalysisNodeAtSelection(editor, {
        version: 1,
        kind,
        settings: {},
      });
      startEditing(nodeId, "setup");
    },
    [editor, canWrite, startEditing],
  );

  const insertAnalysisBelow = useCallback(
    (sourceNodeId: string, definition: ProductAnalyticsNodeDefinition) => {
      if (editor === null || !canWrite) {
        return;
      }
      const lastInserted = lastInsertedBelowRef.current.get(sourceNodeId);
      const anchorNodeId =
        lastInserted !== undefined &&
        findAnalysisNode(editor.state.doc, lastInserted) !== undefined
          ? lastInserted
          : sourceNodeId;
      const nodeId = insertAnalysisNodeAfter(editor, anchorNodeId, definition);
      lastInsertedBelowRef.current.set(sourceNodeId, nodeId);
      setHighlightedNodeId(nodeId);
      requestAnimationFrame(() => scrollNodeIntoView(editor, nodeId));
    },
    [editor, canWrite],
  );

  return useMemo(
    () => ({
      editor,
      tableId,
      dateRange,
      canWrite,
      editingNodeId,
      panelTab,
      insightsTransition,
      highlightedNodeId,
      startEditing,
      stopEditing,
      setPanelTab,
      showInsights,
      insertAnalysis,
      insertAnalysisBelow,
    }),
    [
      editor,
      tableId,
      dateRange,
      canWrite,
      editingNodeId,
      panelTab,
      insightsTransition,
      highlightedNodeId,
      startEditing,
      stopEditing,
      setPanelTab,
      showInsights,
      insertAnalysis,
      insertAnalysisBelow,
    ],
  );
};
