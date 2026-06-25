import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { useDispatch, useSelector, useStore } from "metabase/redux";
import { useEditorHost } from "metabase/rich_text_editing/tiptap/EditorHost";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { Box, Button, Flex, Modal, Text } from "metabase/ui";
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
  const host = useEditorHost();
  const metadata = useSelector(getMetadata);
  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );
  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );

  useEffect(() => {
    if (isOpen && card) {
      dispatch(host.actions.loadMetadataForDocumentCard(card));
    }
  }, [isOpen, card, dispatch, host.actions]);

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
      await dispatch(
        host.actions.loadMetadataForDocumentCard(newQuestion.card()),
      );
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
      const modifiedData = {
        dataset_query: modifiedQuestion.datasetQuery(),
        display: modifiedQuestion.display(),
        visualization_settings:
          modifiedQuestion.card().visualization_settings ?? {},
      };

      const newCardId = host.actions.generateDraftCardId();

      dispatch(
        host.actions.createDraftCard({
          originalCard: card,
          modifiedData,
          draftId: newCardId,
        }),
      );

      onSave({ card_id: newCardId });
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
            <Button variant="filled" onClick={handleSave}>
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
