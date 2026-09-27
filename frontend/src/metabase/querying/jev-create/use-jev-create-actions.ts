import { useCallback, useState } from "react";

import {
  useCreateDashboardMutation,
  useCreateDocumentMutation,
} from "metabase/api";
import {
  type JevCardCollectionKind,
  useAddJevDashcardsMutation,
} from "metabase/api/jev-create";
import { getUserPersonalCollectionId } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { CardId } from "metabase-types/api";

import { getJevDashcardLayout } from "./dashboard-layout";
import { getJevDocumentContent } from "./document-content";
import {
  type JevQuestionChoices,
  buildJevQuestionQuery,
  getJevQuestionCard,
} from "./question-query";
import type { JevTableQuery } from "./use-load-jev-table-query";

export function useJevCreateActions() {
  const navigate = useNavigate();
  const personalCollectionId = useSelector(getUserPersonalCollectionId);
  const [createDashboard] = useCreateDashboardMutation();
  const [addDashcards] = useAddJevDashcardsMutation();
  const [createDocument] = useCreateDocumentMutation();
  const [isCreating, setIsCreating] = useState(false);
  const [failedKind, setFailedKind] = useState<JevCardCollectionKind | null>(
    null,
  );

  const openQuestion = useCallback(
    ({ query, columnsByKey }: JevTableQuery, choices: JevQuestionChoices) => {
      const newQuery = buildJevQuestionQuery(query, columnsByKey, choices);
      const card = getJevQuestionCard(newQuery, choices.display);
      navigate(Urls.serializedQuestion(card, { includeDisplayIsLocked: true }));
    },
    [navigate],
  );

  const createDashboardWithCards = useCallback(
    async (name: string, cardIds: readonly CardId[]) => {
      const dashboard = await createDashboard({
        name,
        collection_id: personalCollectionId ?? null,
      }).unwrap();
      await addDashcards({
        dashboardId: dashboard.id,
        dashcards: getJevDashcardLayout(cardIds),
      }).unwrap();
      return Urls.dashboard(dashboard);
    },
    [createDashboard, addDashcards, personalCollectionId],
  );

  const createDocumentWithCards = useCallback(
    async (name: string, cardIds: readonly CardId[]) => {
      const document = await createDocument({
        name,
        collection_id: personalCollectionId ?? undefined,
        document: getJevDocumentContent(cardIds),
      }).unwrap();
      return Urls.document(document);
    },
    [createDocument, personalCollectionId],
  );

  /** Creates a dashboard or document holding `cardIds`, then opens it. Resolves to whether it worked. */
  const createWithCards = useCallback(
    async (
      kind: JevCardCollectionKind,
      name: string,
      cardIds: readonly CardId[],
    ): Promise<boolean> => {
      setIsCreating(true);
      setFailedKind(null);
      try {
        const url =
          kind === "dashboard"
            ? await createDashboardWithCards(name, cardIds)
            : await createDocumentWithCards(name, cardIds);
        navigate(url);
        return true;
      } catch {
        setFailedKind(kind);
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [createDashboardWithCards, createDocumentWithCards, navigate],
  );

  return { openQuestion, createWithCards, isCreating, failedKind };
}
