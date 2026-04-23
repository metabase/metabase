import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useUpdateCardMutation } from "metabase/api/card";
import { useCreateDocumentCardMutation } from "metabase/api/document";
import { loadMetadataForDocumentCard } from "metabase/documents/documents.slice";
import { getCurrentDocument } from "metabase/documents/selectors";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { Box, Button, Flex, Modal, Text } from "metabase/ui";
import { useDispatch, useSelector, useStore } from "metabase/utils/redux";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import S from "./ModifyQuestionModal.module.css";

interface ModifyQuestionModalProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onSave: (result: { card_id: number }) => void;
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
  const document = useSelector(getCurrentDocument);
  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );
  const [createDocumentCard, { isLoading: isCreating }] =
    useCreateDocumentCardMutation();
  const [updateCard, { isLoading: isUpdating }] = useUpdateCardMutation();
  const isSaving = isCreating || isUpdating;

  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );

  useEffect(() => {
    if (isOpen && card) {
      dispatch(loadMetadataForDocumentCard(card));
    }
  }, [isOpen, card, dispatch]);

  const question = useMemo(() => {
    if (!card || !metadata || !isOpen) {
      return null;
    }

    const baseQuestion = new Question(card, metadata);
    if (!modifiedQuestion) {
      setModifiedQuestion(baseQuestion);
    }
    return baseQuestion;
  }, [card, metadata, isOpen, modifiedQuestion]);

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
      await dispatch(loadMetadataForDocumentCard(newQuestion.card()));
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
    if (!modifiedQuestion || !document) {
      return;
    }

    const payload = {
      dataset_query: modifiedQuestion.datasetQuery(),
      display: modifiedQuestion.display(),
      visualization_settings:
        modifiedQuestion.card().visualization_settings ?? {},
    };
    try {
      if (card.document_id === document.id && card.id) {
        await updateCard({ id: card.id, ...payload }).unwrap();
        onSave({ card_id: card.id });
      } else {
        const created = await createDocumentCard({
          document_id: document.id,
          name: card.name,
          ...payload,
        }).unwrap();
        onSave({ card_id: created.id });
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
      {question && modifiedQuestion ? (
        <>
          <Box h="70vh" className={S.notebookContainer}>
            <Notebook
              question={modifiedQuestion}
              isDirty={true}
              isRunnable={true}
              isResultDirty={true}
              reportTimezone={reportTimezone}
              hasVisualizeButton={false}
              updateQuestion={handleUpdateQuestion}
            />
          </Box>
          <Flex mt="lg" justify="flex-end" gap="0.5rem">
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              onClick={handleSave}
              disabled={isSaving || !document}
              loading={isSaving}
            >
              {t`Save and use`}
            </Button>
          </Flex>
        </>
      ) : (
        <Flex h="70vh" align="center" justify="center">
          <Text>{t`Failed to load question data`}</Text>
        </Flex>
      )}
    </Modal>
  );
};
