import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import type { DocumentContent } from "metabase-types/api";

import type { CardEmbedRef } from "../components/Editor/types";
import { setCardEmbeds } from "../documents.slice";

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

  return {
    documentTitle,
    setDocumentTitle,
    documentContent,
    setDocumentContent,
    updateCardEmbeds,
  };
}
