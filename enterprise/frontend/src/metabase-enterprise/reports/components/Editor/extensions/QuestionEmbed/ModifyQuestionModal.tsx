import { useMemo, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Loader, Modal, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import { useCreateReportSnapshotMutation } from "../../../../../api/report";

interface ModifyQuestionModalProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onSave: (result: {
    card_id: number;
    snapshot_id: number;
    name: string;
  }) => void;
}

export const ModifyQuestionModal = ({
  card,
  isOpen,
  onClose,
  onSave,
}: ModifyQuestionModalProps) => {
  const store = useStore();
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );
  const [createReportSnapshot] = useCreateReportSnapshotMutation();

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
      const { id, created_at, updated_at, ...cardWithoutExcluded } = card;
      const result = await createReportSnapshot({
        ...cardWithoutExcluded,
        dataset_query: modifiedQuestion.datasetQuery(),
        display: modifiedQuestion.display(),
        name: cardName,
        visualization_settings:
          modifiedQuestion.card().visualization_settings || {},
        collection_id: card.collection_id || null,
      }).unwrap();

      onSave({
        card_id: result.card_id,
        snapshot_id: result.snapshot_id,
        name: cardName,
      });
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
