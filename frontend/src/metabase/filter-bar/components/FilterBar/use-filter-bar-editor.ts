import type { Editor } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  documentToTokens,
  documentToTokensWithPositions,
  tokensToContent,
} from "../../editor/document";
import { setErrorPositions } from "../../editor/error-highlight";
import { createPillRegistry } from "../../editor/pill-registry";
import { applyImplicitAnds } from "../../model/implicit-and";
import { normalizeTokens } from "../../model/normalize-tokens";
import { parseTokens } from "../../model/parse-tokens";
import { stagesToTokens } from "../../model/stages-to-tokens";
import type { ParseError } from "../../model/types";
import { isEmptyTree, isSameStages } from "../../model/utils";
import type { FilterBarProps } from "../../types";

import { createExtensions } from "./extensions";

const valueToTokens = <F>(
  value: FilterBarProps<F>["value"],
  adapter: FilterBarProps<F>["adapter"],
) => applyImplicitAnds(stagesToTokens(value, adapter));

const hasText = (editor: Editor) => {
  let found = false;
  editor.state.doc.descendants((node) => {
    found ||= node.isText;
  });
  return found;
};

export const useFilterBarEditor = <F>({
  value,
  onChange,
  adapter,
}: FilterBarProps<F>) => {
  const [registry] = useState(() => createPillRegistry<F>());
  const extensions = useMemo(
    () => createExtensions(adapter, registry),
    [adapter, registry],
  );
  const [error, setError] = useState<ParseError | null>(null);
  const isValidatingRef = useRef(false);
  const emittedRef = useRef({ value, tokens: valueToTokens(value, adapter) });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const showError = (editor: Editor) => {
    const { doc } = editor.state;
    const result = parseTokens(documentToTokens(doc, registry));
    const isShown = isValidatingRef.current && result.type === "error";
    const error = isShown ? result : null;
    const items = documentToTokensWithPositions(doc, registry);
    const positions = (error?.indexes ?? []).flatMap((index) => {
      const item = error ? items[error.stage]?.[index] : undefined;
      return item ? [item.pos] : [];
    });
    setError(error);
    setErrorPositions(editor, positions);
  };

  const emit = (editor: Editor) => {
    const tokens = documentToTokens(editor.state.doc, registry);
    const result = parseTokens(tokens);
    const isSame = isSameStages(emittedRef.current.tokens, tokens);
    if (result.type === "ok" && !isSame) {
      emittedRef.current = { value: result.stages, tokens };
      onChangeRef.current(result.stages);
    }
  };

  const settle = (editor: Editor) => {
    const tokens = documentToTokens(editor.state.doc, registry);
    const normalized = normalizeTokens(tokens);
    isValidatingRef.current = true;
    if (!isSameStages(normalized, tokens) || hasText(editor)) {
      editor.commands.setContent(tokensToContent(normalized, registry));
    }
    showError(editor);
  };

  const editor = useEditor({
    extensions,
    content: tokensToContent(valueToTokens(value, adapter), registry),
    editorProps: { attributes: { spellcheck: "false" } },
    onUpdate: ({ editor }) => {
      emit(editor);
      showError(editor);
    },
    onBlur: ({ editor }) => settle(editor),
  });

  useEffect(() => {
    const isOwnValue = value === emittedRef.current.value;
    if (!editor || isOwnValue) {
      return;
    }
    const tokens = valueToTokens(value, adapter);
    emittedRef.current = { value, tokens };
    isValidatingRef.current = false;
    editor.commands.setContent(tokensToContent(tokens, registry), {
      emitUpdate: false,
    });
    setError(null);
    setErrorPositions(editor, []);
  }, [editor, value, adapter, registry]);

  const hasFilters = value.some((tree) => !isEmptyTree(tree));
  const clear = () => onChange([]);

  return { editor, error, hasFilters, clear };
};
