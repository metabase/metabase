import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  createDraftCard,
  generateDraftCardId,
  loadMetadataForDocumentCard,
} from "metabase/documents/documents.slice";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { Box, Button, Flex, Modal } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

import S from "./CreateStructuredQuestionModal.module.css";

interface CreateQuestionModalProps {
  onSave: (id: number, name: string) => void;
  onClose: () => void;
}

export const CreateStructuredQuestionModal = ({
  onSave,
  onClose,
}: CreateQuestionModalProps) => {
  const store = useStore();
  const dispatch = useDispatch();

  const [modifiedQuestion, setModifiedQuestion] = useState<Question>(() =>
    Question.create(),
  );

  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );

  const canSave = useMemo(
    () => Lib.canSave(modifiedQuestion.query(), modifiedQuestion.type()),
    [modifiedQuestion],
  );

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

  const handleSaveStructuredQuestion = async () => {
    try {
      const name =
        modifiedQuestion.displayName() ||
        modifiedQuestion.generateQueryDescription() ||
        "";

      const dataset_query = modifiedQuestion.datasetQuery();

      const questionWithDefaultDisplay = modifiedQuestion.setDefaultDisplay();

      const modifiedData = {
        name,
        database_id: dataset_query.database || undefined,
        dataset_query: dataset_query,
        display: questionWithDefaultDisplay.display(),
        settings: questionWithDefaultDisplay.settings(),
        visualization_settings:
          questionWithDefaultDisplay.card().visualization_settings ?? {},
      };
      const newCardId = generateDraftCardId();

      dispatch(
        createDraftCard({
          originalCard: undefined,
          modifiedData,
          draftId: newCardId,
        }),
      );

      onSave(newCardId, name);
      onClose();
    } catch (error) {
      console.error("Failed to save modified question:", error);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      size="80%"
      title={t`Create new question`}
      padding="lg"
    >
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
          disabled={!canSave}
          onClick={handleSaveStructuredQuestion}
        >
          {t`Save and use`}
        </Button>
      </Flex>
    </Modal>
  );
};
