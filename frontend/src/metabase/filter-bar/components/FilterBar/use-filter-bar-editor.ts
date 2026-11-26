import type { Editor } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import {
  type FilterEditorRequest,
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
  parseTokens,
  pillToken,
  stagesToTokens,
} from "../../model";
import type { FilterBarProps } from "../../types";

import { createExtensions } from "./extensions";

export const useFilterBarEditor = <F>({
  value,
  onChange,
  adapter,
  autoFocus = false,
}: FilterBarProps<F>) => {
  const [filterEditorRequest, setFilterEditorRequest] =
    useState<FilterEditorRequest<F> | null>(null);
  const adapterRef = useLatest(adapter);
  const getAdapter = useCallback(() => adapterRef.current, [adapterRef]);
  const extensions = useMemo(
    () =>
      createExtensions({
        getAdapter,
        openFilterEditor: setFilterEditorRequest,
      }),
    [getAdapter],
  );
  const [error, setError] = useState<ParseError | null>(null);
  const isValidatingRef = useRef(false);
  const [initialTokens] = useState(() => stagesToTokens(value, adapter));
  const [initialContent] = useState(() => tokensToContent(initialTokens));
  const syncedTokensRef = useRef(initialTokens);
  const onChangeRef = useLatest(onChange);

  const showError = useCallback((editor: Editor) => {
    setError(highlightErrors(editor, isValidatingRef.current));
  }, []);

  const emit = (editor: Editor) => {
    const tokens = readTokens<F>(editor);
    const result = parseTokens(tokens);
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
    const incomingTokens = stagesToTokens(value, adapter);
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
    filterEditorRequest,
    getFilterEditorRect,
    applyFilter,
    closeFilterEditor,
  };
};
