import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import { useGetDocumentQuery, useUpdateDocumentMutation } from "metabase/api";
import type { MetabotAgentId } from "metabase/metabot/state";

import { useDocumentEditTurn } from "./useDocumentEditTurn";

/**
 * State container for the document canvas: loads the document, persists manual
 * edits (debounced) and accepted AI edits, and drives model-assisted edit turns.
 * Shared by the inline embed and the fullscreen view so they stay in sync via
 * the document cache.
 */
export function useDocumentCanvas(documentId: number, agentId: MetabotAgentId) {
  const { data: document, isLoading } = useGetDocumentQuery({ id: documentId });
  const [updateDocument] = useUpdateDocumentMutation();
  const {
    requestEdit,
    isLoading: isEditing,
    error,
  } = useDocumentEditTurn(agentId);

  const [content, setContent] = useState<JSONContent | null>(null);
  const [title, setTitle] = useState("");
  const [proposedDoc, setProposedDoc] = useState<JSONContent | null>(null);
  const proposedTitleRef = useRef<string | null>(null);

  // Seed local state from the fetched document once per document id, so manual
  // edits in progress aren't clobbered by cache refetches.
  const loadedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (document && loadedIdRef.current !== document.id) {
      loadedIdRef.current = document.id;
      setContent(document.document as JSONContent);
      setTitle(document.name);
    }
  }, [document]);

  const persist = useCallback(
    (newContent: JSONContent, newTitle?: string) => {
      if (!document) {
        return;
      }
      setContent(newContent);
      updateDocument({
        id: document.id,
        document: newContent,
        ...(newTitle ? { name: newTitle } : {}),
      });
    },
    [document, updateDocument],
  );

  const debouncedSave = useMemo(
    () => _.debounce((c: JSONContent) => persist(c), 800),
    [persist],
  );

  const onManualChange = useCallback(
    (c: JSONContent) => {
      setContent(c);
      debouncedSave(c);
    },
    [debouncedSave],
  );

  const askForChanges = useCallback(
    async (instructions: string): Promise<boolean> => {
      if (!content) {
        return false;
      }
      const result = await requestEdit(content, instructions);
      if (!result) {
        return false;
      }
      proposedTitleRef.current = result.title;
      setProposedDoc(result.doc);
      return true;
    },
    [content, requestEdit],
  );

  const onReviewResolved = useCallback(
    (finalContent: JSONContent) => {
      setProposedDoc(null);
      const newTitle = proposedTitleRef.current;
      proposedTitleRef.current = null;
      persist(
        finalContent,
        newTitle && newTitle !== title ? newTitle : undefined,
      );
      if (newTitle) {
        setTitle(newTitle);
      }
    },
    [persist, title],
  );

  return {
    document,
    isLoading,
    content,
    title,
    proposedDoc,
    isEditing,
    error,
    onManualChange,
    askForChanges,
    onReviewResolved,
  };
}
