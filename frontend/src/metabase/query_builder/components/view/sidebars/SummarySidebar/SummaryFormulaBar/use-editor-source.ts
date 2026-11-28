import type { EditorView } from "@codemirror/view";
import { useCallback, useRef } from "react";

import type { SummaryWellId } from "../types";

type PendingSource =
  | { kind: "new"; wellId: SummaryWellId; source: string; onReady: () => void }
  | { kind: "edit"; source: string };

function showSource(view: EditorView, source: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: source },
    selection: { anchor: source.length },
    userEvent: "input.type",
  });
}

export function useEditorSource() {
  const viewRef = useRef<EditorView | null>(null);
  const pendingSource = useRef<PendingSource | null>(null);

  const dropPendingSource = useCallback(() => {
    const pending = pendingSource.current;
    pendingSource.current = null;
    if (pending?.kind === "new") {
      pending.onReady();
    }
  }, []);

  const detach = useCallback(() => {
    viewRef.current = null;
    dropPendingSource();
  }, [dropPendingSource]);

  const handleEditorCreate = (view: EditorView) => {
    viewRef.current = view;
    const pending = pendingSource.current;
    if (pending) {
      showSource(view, pending.source);
      dropPendingSource();
    }
  };

  const startNew = (
    wellId: SummaryWellId,
    source: string,
    onReady: () => void,
  ) => {
    pendingSource.current = { kind: "new", wellId, source, onReady };
  };

  const isNewPending = (wellId: SummaryWellId) =>
    pendingSource.current?.kind === "new" &&
    pendingSource.current.wellId === wellId;

  const updateNew = (wellId: SummaryWellId, source: string) => {
    const pending = pendingSource.current;
    if (pending?.kind === "new" && pending.wellId === wellId) {
      pending.source = source;
    }
  };

  // The bar opens at once and the printed formula lands in it, so a double-click's rename
  // keeps its focus. Text typed before the formula arrives stands.
  const showEditedSource = (source: string) => {
    const view = viewRef.current;
    if (view == null) {
      pendingSource.current = { kind: "edit", source };
    } else if (view.state.doc.length === 0) {
      showSource(view, source);
    }
  };

  const focus = () => viewRef.current?.focus();

  return {
    detach,
    handleEditorCreate,
    startNew,
    isNewPending,
    updateNew,
    showEditedSource,
    focus,
  };
}
