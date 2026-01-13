import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import type { DocumentContent } from "metabase-types/api";
import type { CardEmbedRef } from "metabase-types/store/documents";

import { setCardEmbeds, setIsCommentSidebarOpen } from "../documents.slice";

export function useDocumentState(documentData?: {
  name: string;
  document: DocumentContent;
}) {
  const dispatch = useDispatch();
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentContent, setDocumentContent] = useState<JSONContent | null>(
    null,
  );
  const previousEmbedsRef = useRef<CardEmbedRef[]>([]);

  useEffect(() => {
    if (documentData) {
      setDocumentTitle(documentData.name);
      setDocumentContent(documentData.document);
    } else {
      setDocumentContent(null);
    }
  }, [documentData]);

  const revertToOriginalDocument = useCallback(() => {
    if (documentData) {
      setDocumentTitle(documentData.name);
      // Force update to ensure the editor updates with the original content.
      setDocumentContent(Object.assign({}, documentData.document));
    }
  }, [documentData]);

  const updateCardEmbeds = useCallback(
    (newEmbeds: CardEmbedRef[]) => {
      const prevEmbeds = previousEmbedsRef.current;
      const hasChanged =
        newEmbeds.length !== prevEmbeds.length ||
        newEmbeds.some(
          (embed, index) =>
            !prevEmbeds[index] ||
            embed.id !== prevEmbeds[index].id ||
            embed.name !== prevEmbeds[index].name,
        );

      if (hasChanged) {
        previousEmbedsRef.current = newEmbeds;
        dispatch(setCardEmbeds(newEmbeds));
      }
    },
    [dispatch],
  );

  const openCommentSidebar = useCallback(() => {
    dispatch(setIsCommentSidebarOpen(true));
  }, [dispatch]);

  const closeCommentSidebar = useCallback(() => {
    dispatch(setIsCommentSidebarOpen(false));
  }, [dispatch]);

  return {
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    revertToOriginalDocument,
    updateCardEmbeds,
    openCommentSidebar,
    closeCommentSidebar,
  };
}
