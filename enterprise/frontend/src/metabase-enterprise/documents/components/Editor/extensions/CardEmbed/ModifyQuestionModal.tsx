import type { Editor } from "@tiptap/react";
import { useMemo, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { useGetAdhocQueryMetadataQuery } from "metabase/api/dataset";
import { useDispatch, useStore } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Loader, Modal, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import {
  createDraftCard,
  getNextDraftCardId,
  updateDraftCard,
} from "../../../../documents.slice";
import {
  useDocumentsDispatch,
  useDocumentsSelector,
} from "../../../../redux-utils";

interface ModifyQuestionModalProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onSave: (result: { card_id: number; name: string }) => void;
  editor?: Editor;
}

export const ModifyQuestionModal = ({
  card,
  isOpen,
  onClose,
  onSave,
  editor,
}: ModifyQuestionModalProps) => {
  const store = useStore();
  const dispatch = useDispatch();
  const documentsDispatch = useDocumentsDispatch();
  const metadata = useDocumentsSelector(getMetadata);
  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );

  // Check if this is a draft card
  const isDraftCard = card.id < 0;

  // For draft cards, use adhoc metadata query
  const { data: adhocMetadata, isLoading: isAdhocMetadataLoading } =
    useGetAdhocQueryMetadataQuery(
      isDraftCard && card.dataset_query ? card.dataset_query : undefined,
      { skip: !isDraftCard || !card.dataset_query },
    );

  // For regular cards, use the existing metadata loading approach
  const metadataState = useAsync(async () => {
    if (isOpen && card && !isDraftCard) {
      await dispatch(loadMetadataForCard(card));
    }
  }, [isOpen, card, dispatch, isDraftCard]);

  const question = useMemo(() => {
    const isMetadataLoading = isDraftCard
      ? isAdhocMetadataLoading
      : metadataState.loading;
    const hasMetadataError = isDraftCard ? false : metadataState.error;
    const hasMetadata = isDraftCard ? !!adhocMetadata : !!metadata;

    if (
      isMetadataLoading ||
      hasMetadataError ||
      !card ||
      !hasMetadata ||
      !isOpen
    ) {
      return null;
    }

    const baseQuestion = new Question(card, metadata);
    if (!modifiedQuestion) {
      setModifiedQuestion(baseQuestion);
    }
    return baseQuestion;
  }, [
    isDraftCard,
    isAdhocMetadataLoading,
    metadataState.loading,
    metadataState.error,
    adhocMetadata,
    card,
    metadata,
    isOpen,
    modifiedQuestion,
  ]);

  const handleUpdateQuestion = async (newQuestion: Question) => {
    const currentDependencies = modifiedQuestion
      ? Lib.dependentMetadata(
          modifiedQuestion.query(),
          modifiedQuestion.id(),
          modifiedQuestion.type(),
        )
      : [];

    const nextDependencies = Lib.dependentMetadata(
      newQuestion.query(),
      newQuestion.id(),
      newQuestion.type(),
    );

    if (!_.isEqual(currentDependencies, nextDependencies)) {
      // For draft cards, we don't need to reload metadata as it's already loaded via adhoc query
      if (!isDraftCard) {
        await dispatch(loadMetadataForCard(newQuestion.card()));
        const freshMetadata = getMetadata(store.getState());
        const questionWithFreshMetadata = new Question(
          newQuestion.card(),
          freshMetadata,
        );
        setModifiedQuestion(questionWithFreshMetadata);
      } else {
        setModifiedQuestion(newQuestion);
      }
    } else {
      setModifiedQuestion(newQuestion);
    }
  };

  const handleSave = async () => {
    if (!modifiedQuestion || !editor) {
      return;
    }

    try {
      const modifiedData = {
        dataset_query: modifiedQuestion.datasetQuery(),
        display: modifiedQuestion.display(),
        visualization_settings:
          modifiedQuestion.card().visualization_settings ?? {},
      };

      // Check if card is a document-specific card
      const isDocumentCard = card.type === "in_document";

      let newCardId: number;
      if (isDocumentCard) {
        // If card has report_id, keep the same ID and update it in Redux
        documentsDispatch(
          updateDraftCard({
            id: card.id,
            modifiedData,
          }),
        );
        newCardId = card.id;
      } else {
        // If card doesn't have report_id, create a draft with negative ID
        const nextDraftId = getNextDraftCardId();

        documentsDispatch(
          createDraftCard({
            originalCard: card,
            modifiedData,
          }),
        );
        newCardId = nextDraftId;
      }

      onSave({ card_id: newCardId, name: card.name });
      onClose();
    } catch (error) {
      console.error("Failed to save modified question:", error);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="80%"
      title={t`Modify question`}
      padding="lg"
    >
      {(isDraftCard ? isAdhocMetadataLoading : metadataState.loading) ? (
        <Box
          style={{
            height: "70vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Loader size="lg" />
        </Box>
      ) : question && modifiedQuestion ? (
        <>
          <Box style={{ height: "70vh", overflow: "auto" }}>
            <Notebook
              question={modifiedQuestion}
              isDirty={true}
              isRunnable={true}
              isResultDirty={true}
              reportTimezone="UTC"
              hasVisualizeButton={false}
              updateQuestion={handleUpdateQuestion}
              runQuestionQuery={async () => {}}
            />
          </Box>
          <Box
            mt="lg"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
            }}
          >
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button variant="filled" onClick={handleSave}>
              {t`Save and use`}
            </Button>
          </Box>
        </>
      ) : (
        <Box
          style={{
            height: "70vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text>{t`Failed to load question data`}</Text>
        </Box>
      )}
    </Modal>
  );
};
