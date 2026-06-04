import type { JSONContent } from "@tiptap/core";
import { useCallback, useState } from "react";

import { useMetabotEditDocumentMutation } from "metabase/api";
import {
  type MetabotAgentId,
  getHistory,
  getMetabotRequestState,
} from "metabase/metabot/state";
import {
  documentToMarkdown,
  markdownToDocument,
} from "metabase/metabot/utils/document-markdown";
import { useSelector } from "metabase/redux";

export type DocumentEditResult = {
  /** The proposed revised document, ready to diff against the current one. */
  doc: JSONContent;
  title: string | null;
};

/**
 * Drives an ephemeral document-edit turn. Serializes the current document to
 * Markdown, sends it (plus the parent conversation's history/state, so the edit
 * reuses its context) to `/api/metabot/document/edit`, and rebuilds the proposed
 * document from the model's reply. These turns never touch the main chat.
 */
export function useDocumentEditTurn(agentId: MetabotAgentId) {
  const [editDocument, { isLoading }] = useMetabotEditDocumentMutation();
  const [error, setError] = useState<string | null>(null);

  const history = useSelector((state) => getHistory(state, agentId));
  const conversationState = useSelector((state) =>
    getMetabotRequestState(state, agentId),
  );

  const requestEdit = useCallback(
    async (
      currentDoc: JSONContent,
      instructions: string,
    ): Promise<DocumentEditResult | null> => {
      setError(null);
      const { markdown, embedCardIds } = documentToMarkdown(currentDoc);
      try {
        const result = await editDocument({
          instructions,
          current_document: markdown,
          history,
          state: conversationState as Record<string, unknown>,
        }).unwrap();

        if (!result.content) {
          setError(result.error ?? null);
          return null;
        }
        return {
          doc: markdownToDocument(result.content, embedCardIds),
          title: result.title,
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [editDocument, history, conversationState],
  );

  return { requestEdit, isLoading, error };
}
