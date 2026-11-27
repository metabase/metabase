import type { Editor } from "@tiptap/core";
import { useCallback, useRef, useState } from "react";
import { useLatest } from "react-use";

import {
  readTokens,
  replaceDocument,
  replacePillTokens,
  tokensToContent,
} from "../../editor";
import { isSameStages, tokensToTrees, treesToTokens } from "../../model";
import type { FilterBarAdapter, FilterStages } from "../../types";

type HostSyncOptions<F> = {
  value: FilterStages<F>;
  adapter: FilterBarAdapter<F>;
  onChange: (stages: FilterStages<F>) => void;
  onReplace: (editor: Editor) => void;
};

export const useHostSync = <F>({
  value,
  adapter,
  onChange,
  onReplace,
}: HostSyncOptions<F>) => {
  const [initialTokens] = useState(() => treesToTokens(value, adapter));
  const [initialContent] = useState(() => tokensToContent(initialTokens));
  const syncedTokensRef = useRef(initialTokens);
  const onChangeRef = useLatest(onChange);
  const onReplaceRef = useLatest(onReplace);

  const emit = useCallback(
    (editor: Editor) => {
      const tokens = readTokens<F>(editor);
      const result = tokensToTrees(tokens);
      const hasFiltersChanged = !isSameStages(syncedTokensRef.current, tokens);
      if (result.type === "ok" && hasFiltersChanged) {
        syncedTokensRef.current = tokens;
        onChangeRef.current(result.stages);
      }
    },
    [onChangeRef],
  );

  const receive = useCallback(
    (editor: Editor, value: FilterStages<F>, adapter: FilterBarAdapter<F>) => {
      const tokens = treesToTokens(value, adapter);
      const isEchoOfOwnChange = isSameStages(syncedTokensRef.current, tokens);
      syncedTokensRef.current = tokens;
      if (isEchoOfOwnChange) {
        replacePillTokens(editor, tokens);
        return;
      }
      replaceDocument(editor, tokens, { emitUpdate: false });
      onReplaceRef.current(editor);
    },
    [onReplaceRef],
  );

  return { initialContent, emit, receive };
};
