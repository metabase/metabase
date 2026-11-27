import type { Editor } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import {
  type FilterEditorRequest,
  clearErrors,
  getPillRectAt,
  highlightErrors,
  normalizeDocument,
  placePillAt,
  readTokens,
  replaceDocument,
  replacePillTokens,
  tokensToContent,
} from "../../editor";
import {
  type ParseError,
  isEmptyTree,
  isSameStages,
  pillToken,
  tokensToTrees,
  treesToTokens,
} from "../../model";
import type { FilterBarProps } from "../../types";
import type { ListKeys } from "../SuggestionList/SuggestionList";

import type { DraftSuggestion } from "./draft-suggestion";
import { createExtensions } from "./extensions";

export const useFilterBarEditor = <F>({
  value,
  onChange,
  adapter,
  autoFocus = false,
}: FilterBarProps<F>) => {
  const [filterEditorRequest, setFilterEditorRequest] =
    useState<FilterEditorRequest<F> | null>(null);
  const [suggestion, setSuggestion] = useState<DraftSuggestion<F> | null>(null);
  const listKeysRef = useRef<ListKeys | null>(null);
  const adapterRef = useLatest(adapter);
  const getAdapter = useCallback(() => adapterRef.current, [adapterRef]);
  const handleSuggestionKeyDown = useCallback(
    (event: KeyboardEvent) => listKeysRef.current?.(event) ?? false,
    [],
  );
  const extensions = useMemo(
    () =>
      createExtensions({
        getAdapter,
        openFilterEditor: setFilterEditorRequest,
        onSuggestionChange: setSuggestion,
        onSuggestionKeyDown: handleSuggestionKeyDown,
      }),
    [getAdapter, handleSuggestionKeyDown],
  );
  const [error, setError] = useState<ParseError | null>(null);
  const isValidatingRef = useRef(false);
  const [initialTokens] = useState(() => treesToTokens(value, adapter));
  const [initialContent] = useState(() => tokensToContent(initialTokens));
  const syncedTokensRef = useRef(initialTokens);
  const onChangeRef = useLatest(onChange);

  const showError = useCallback((editor: Editor) => {
    if (isValidatingRef.current) {
      setError(highlightErrors(editor));
    } else {
      clearErrors(editor);
      setError(null);
    }
  }, []);

  const emit = (editor: Editor) => {
    const tokens = readTokens<F>(editor);
    const result = tokensToTrees(tokens);
    const hasFiltersChanged = !isSameStages(syncedTokensRef.current, tokens);
    if (result.type === "ok" && hasFiltersChanged) {
      syncedTokensRef.current = tokens;
      onChangeRef.current(result.stages);
    }
  };

  const settle = (editor: Editor) => {
    isValidatingRef.current = true;
    normalizeDocument<F>(editor);
    showError(editor);
  };

  const editor = useEditor({
    extensions,
    content: initialContent,
    autofocus: autoFocus ? "end" : false,
    editorProps: { attributes: { spellcheck: "false" } },
    onUpdate: ({ editor }) => {
      emit(editor);
      showError(editor);
    },
    onBlur: ({ editor }) => settle(editor),
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const incomingTokens = treesToTokens(value, adapter);
    const isEchoOfOwnChange = isSameStages(
      syncedTokensRef.current,
      incomingTokens,
    );
    if (isEchoOfOwnChange) {
      replacePillTokens(editor, incomingTokens);
      syncedTokensRef.current = incomingTokens;
      return;
    }
    syncedTokensRef.current = incomingTokens;
    isValidatingRef.current = false;
    replaceDocument(editor, incomingTokens, { emitUpdate: false });
    showError(editor);
  }, [editor, value, adapter, showError]);

  const hasFilters = value.some((tree) => !isEmptyTree(tree));
  const clear = () => {
    onChange([]);
  };

  const getFilterEditorRect = () =>
    editor && filterEditorRequest
      ? getPillRectAt(editor, filterEditorRequest.pos)
      : null;

  const closeFilterEditor = () => {
    setFilterEditorRequest(null);
    editor?.commands.focus();
  };

  const dismissPopover = () => {
    if (filterEditorRequest) {
      closeFilterEditor();
    }
  };

  const applyFilter = (filter: F) => {
    if (editor && filterEditorRequest) {
      const { pos, stage } = filterEditorRequest;
      const token = pillToken(filter, adapter.stage(stage).toPill(filter));
      placePillAt(editor, pos, token, stage);
    }
    closeFilterEditor();
  };

  return {
    editor,
    error,
    hasFilters,
    clear,
    suggestion,
    listKeysRef,
    filterEditorRequest,
    getFilterEditorRect,
    applyFilter,
    closeFilterEditor,
    dismissPopover,
  };
};
