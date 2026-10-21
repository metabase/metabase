import type { JSONContent } from "@tiptap/react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import _ from "underscore";

import { useDispatch } from "metabase/redux";
import type { CardEmbedRef } from "metabase/redux/store/documents";
import type { DocumentContent } from "metabase-types/api";

import { setCardEmbeds } from "../documents.slice";
import { doesDocumentNeedMigration } from "../utils/editorNodeUtils";

type SavedDocument = { name: string; document: JSONContent };

/**
 * `lastSavedRef` holds what an auto-save last sent. When a reload matches it,
 * the editor already shows it, so the title and content aren't reset (which
 * would move the cursor and drop edits made while saving).
 */
export function useDocumentState(
  documentData?: {
    name: string;
    document: DocumentContent;
  },
  lastSavedRef?: RefObject<SavedDocument | null>,
) {
  const dispatch = useDispatch();
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentContent, setDocumentContent] = useState<JSONContent | null>(
    null,
  );
  const [documentNeedsMigration, setDocumentNeedsMigration] = useState(false);
  const previousEmbedsRef = useRef<CardEmbedRef[]>([]);

  useEffect(() => {
    if (documentData) {
      const lastSaved = lastSavedRef?.current ?? null;
      if (lastSaved === null || lastSaved.name !== documentData.name) {
        setDocumentTitle(documentData.name);
      }
      if (
        lastSaved === null ||
        !_.isEqual(lastSaved.document, documentData.document)
      ) {
        setDocumentContent(documentData.document);
      }
      setDocumentNeedsMigration(
        doesDocumentNeedMigration(documentData.document),
      );
    } else {
      setDocumentContent(null);
      setDocumentNeedsMigration(false);
    }
  }, [documentData, lastSavedRef]);

  const updateCardEmbeds = useCallback(
    (newEmbeds: CardEmbedRef[]) => {
      const prevEmbeds = previousEmbedsRef.current;
      const hasChanged =
        newEmbeds.length !== prevEmbeds.length ||
        newEmbeds.some(
          (embed, index) =>
            !prevEmbeds[index] ||
            embed.id !== prevEmbeds[index].id ||
            embed.name !== prevEmbeds[index].name ||
            embed.stored_result_id !== prevEmbeds[index].stored_result_id ||
            embed.sort !== prevEmbeds[index].sort,
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
    documentNeedsMigration,
    updateCardEmbeds,
  };
}
