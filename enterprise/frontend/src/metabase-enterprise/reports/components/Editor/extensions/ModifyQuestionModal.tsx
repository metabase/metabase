import { useEffect, useState } from "react";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Loader, Modal, Text } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

interface ModifyQuestionModalProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newCard: Card) => void;
}

export const ModifyQuestionModal = ({
  card,
  isOpen,
  onClose,
  onSave,
}: ModifyQuestionModalProps) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [createCard] = useCreateCardMutation();

  // Load metadata when modal opens
  useEffect(() => {
    if (isOpen && card) {
      setIsLoadingMetadata(true);
      setMetadataLoaded(false);

      // Load metadata for the card
      dispatch(loadMetadataForCard(card) as any)
        .then(() => {
          setMetadataLoaded(true);
        })
        .catch((error: any) => {
          console.error("Failed to load metadata:", error);
          setIsLoadingMetadata(false);
        });
    }
  }, [isOpen, dispatch, card]);

  // Create question when metadata is available
  useEffect(() => {
    if (metadataLoaded && metadata && card) {
      // Check if we have the necessary metadata
      const database = metadata.database(card.dataset_query?.database);
      const table = card.dataset_query?.query?.["source-table"]
        ? metadata.table(card.dataset_query.query["source-table"])
        : null;

      if (database && (card.dataset_query?.type === "native" || table)) {
        // Metadata is ready, create the question
        const question = new Question(card, metadata);
        setModifiedQuestion(question);
        setIsLoadingMetadata(false);
      }
    }
  }, [metadataLoaded, metadata, card]);

  const handleSave = async () => {
    if (!modifiedQuestion) {
      return;
    }

    try {
      const newCard = await createCard({
        dataset_query: modifiedQuestion.datasetQuery(),
        display: modifiedQuestion.display(),
        name: t`Copy of ${card.name}`,
        visualization_settings:
          modifiedQuestion.card().visualization_settings || {},
        collection_id: card.collection_id,
      }).unwrap();

      onSave(newCard);
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
      {isLoadingMetadata ? (
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
      ) : modifiedQuestion ? (
        <>
          <Box style={{ height: "70vh", overflow: "auto" }}>
            <Notebook
              question={modifiedQuestion}
              isDirty={true}
              isRunnable={true}
              isResultDirty={true}
              reportTimezone="UTC"
              hasVisualizeButton={false}
              updateQuestion={async (question: Question) => {
                setModifiedQuestion(question);
              }}
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
