import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import type { CollectionId, DocumentContent } from "metabase-types/api";

import type { CardEmbedRef } from "../components/Editor/types";
import { setCardEmbeds } from "../documents.slice";
import { useDocumentsSelector } from "../redux-utils";
import { getCardEmbeds } from "../selectors";

export function useDocumentState(documentData?: {
  name: string;
  document: DocumentContent;
}) {
  const dispatch = useDispatch();
  const cardEmbeds = useDocumentsSelector(getCardEmbeds);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentContent, setDocumentContent] = useState<JSONContent | null>(
    null,
  );
  const [documentCollectionId, setDocumentCollectionId] =
    useState<CollectionId | null>(null);
  const previousEmbedsRef = useRef<CardEmbedRef[]>([]);

  // Sync document data when it changes
  useEffect(() => {
    if (documentData) {
      setDocumentTitle(documentData.name);
      // Document is always a JSON object
      setDocumentContent((documentData.document as JSONContent) || null);
    } else {
      // When switching to new document, reset content
      setDocumentContent(null);
    }
  }, [documentData]);

  const updateCardEmbeds = useCallback(
    (newEmbeds: CardEmbedRef[]) => {
      // Only dispatch if the embeds have actually changed to prevent infinite loops
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

  return {
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    documentCollectionId,
    setDocumentCollectionId,
    cardEmbeds,
    updateCardEmbeds,
  };
}
