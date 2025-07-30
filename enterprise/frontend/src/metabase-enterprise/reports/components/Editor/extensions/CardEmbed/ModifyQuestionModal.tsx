import { useMemo, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { useDispatch, useStore } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Loader, Modal, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import { useReportsSelector } from "../../../../redux-utils";
import { fetchCardDataset } from "../../../../reports.slice";

interface ModifyQuestionModalProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onSave: (result: { card_id: number; name: string }) => void;
}

export const ModifyQuestionModal = ({
  card,
  isOpen,
  onClose,
  onSave,
}: ModifyQuestionModalProps) => {
  const store = useStore();
  const dispatch = useDispatch();
  const metadata = useReportsSelector(getMetadata);
  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );
  const [createCard] = cardApi.useCreateCardMutation();
  const [updateCard] = cardApi.useUpdateCardMutation();

  const metadataState = useAsync(async () => {
    if (isOpen && card) {
      await dispatch(loadMetadataForCard(card));
    }
  }, [isOpen, card, dispatch]);

  const question = useMemo(() => {
    if (
      metadataState.loading ||
      metadataState.error ||
      !card ||
      !metadata ||
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
    metadataState.loading,
    metadataState.error,
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
  };

  const handleSave = async () => {
    if (!modifiedQuestion) {
      return;
    }

    try {
      const cardName = t`Copy of ${card.name}`;

      if (card.type === "in_report") {
        // Card is already an in_report type, just update it
        await updateCard({
          id: card.id,
          dataset_query: modifiedQuestion.datasetQuery(),
          display: modifiedQuestion.display(),
          visualization_settings:
            modifiedQuestion.card().visualization_settings || {},
        });

        // Refetch the dataset after updating the in_report card
        await dispatch(fetchCardDataset(card.id));

        onSave({
          card_id: card.id,
          name: cardName,
        });
      } else {
        // Card is a regular card, create a new in_report card
        const { id, created_at, updated_at, ...cardData } = card;
        const savedCard = await createCard({
          ...cardData,
          type: "in_report",
          dataset_query: modifiedQuestion.datasetQuery(),
          display: modifiedQuestion.display(),
          name: cardName,
          visualization_settings:
            modifiedQuestion.card().visualization_settings || {},
          collection_id: card.collection_id || null,
        }).unwrap();

        onSave({
          card_id: savedCard?.id,
          name: cardName,
        });
      }

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
      {metadataState.loading ? (
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
