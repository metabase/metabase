import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDispatch } from "metabase/redux";
import type { CardEmbedRef } from "metabase/redux/store/documents";
import type { DocumentContent } from "metabase-types/api";

import {
  clearDraftCards,
  setCardEmbeds,
  setIsCommentSidebarOpen,
} from "../documents.slice";
import { doesDocumentNeedMigration } from "../utils/editorNodeUtils";

export function useDocumentState(documentData?: {
  name: string;
  document: DocumentContent;
}) {
  const dispatch = useDispatch();
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentContent, setDocumentContent] = useState<JSONContent | null>(
    null,
  );
  const [documentNeedsMigration, setDocumentNeedsMigration] = useState(false);
  const previousEmbedsRef = useRef<CardEmbedRef[]>([]);

  useEffect(() => {
    dispatch(clearDraftCards());
    if (documentData) {
      setDocumentTitle(documentData.name);
      setDocumentContent(documentData.document);
      setDocumentNeedsMigration(
        doesDocumentNeedMigration(documentData.document),
      );
    } else {
      setDocumentContent(null);
    }
  }, [documentData, dispatch]);

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
    documentNeedsMigration,
    updateCardEmbeds,
    openCommentSidebar,
    closeCommentSidebar,
  };
}
