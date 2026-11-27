import { useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import type { DraftSuggestion } from "../../editor";
import { isEmptyTree } from "../../model";
import type { FilterBarProps, FilterParts } from "../../types";
import type { ListKeys } from "../SuggestionList/SuggestionList";

import { createExtensions } from "./extensions";
import { useFilterEditor } from "./use-filter-editor";
import { useFilterErrors } from "./use-filter-errors";
import { useHostSync } from "./use-host-sync";

export const useFilterBarEditor = <F>({
  value,
  onChange,
  adapter,
  autoFocus = false,
}: FilterBarProps<F>) => {
  const [suggestion, setSuggestion] = useState<DraftSuggestion<F> | null>(null);
  const listKeysRef = useRef<ListKeys | null>(null);
  const adapterRef = useLatest(adapter);
  const { error, showError, settleErrors, resetErrors } = useFilterErrors<F>();
  const { initialContent, emit, receive } = useHostSync({
    value,
    adapter,
    onChange,
    onReplace: resetErrors,
  });
  const filterEditor = useFilterEditor(adapter);

  const getAdapter = useCallback(() => adapterRef.current, [adapterRef]);
  const handleSuggestionKeyDown = useCallback(
    (event: KeyboardEvent) => listKeysRef.current?.(event) ?? false,
    [],
  );
  const extensions = useMemo(
    () =>
      createExtensions({
        getAdapter,
        openFilterEditor: filterEditor.open,
        onSuggestionChange: setSuggestion,
        onSuggestionKeyDown: handleSuggestionKeyDown,
      }),
    [getAdapter, filterEditor.open, handleSuggestionKeyDown],
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    autofocus: autoFocus ? "end" : false,
    editorProps: { attributes: { spellcheck: "false" } },
    onUpdate: ({ editor }) => {
      emit(editor);
      showError(editor);
    },
    onBlur: ({ editor }) => settleErrors(editor),
  });

  useEffect(() => {
    if (editor) {
      receive(editor, value, adapter);
    }
  }, [editor, value, adapter, receive]);

  const context = useMemo(
    () => ({
      formatValues: (stage: number, parts: FilterParts) =>
        adapter.stage(stage).formatValues(parts),
    }),
    [adapter],
  );

  return {
    editor,
    error,
    hasFilters: value.some((tree) => !isEmptyTree(tree)),
    clear: () => onChange([]),
    suggestion,
    listKeysRef,
    getFilterEditorRect: () => filterEditor.getRect(editor),
    dismissPopover: () => filterEditor.dismiss(editor),
    filterEditor: filterEditor.render(editor),
    context,
  };
};
