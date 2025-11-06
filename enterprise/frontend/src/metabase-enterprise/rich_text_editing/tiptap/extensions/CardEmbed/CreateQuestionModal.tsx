import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListDatabasesQuery } from "metabase/api";
import S from "metabase/dashboard/components/QuestionPicker/QuestionPicker.module.css";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { Box, Button, Flex, Icon, Modal } from "metabase/ui";
import {
  createDraftCard,
  generateDraftCardId,
  loadMetadataForDocumentCard,
} from "metabase-enterprise/documents/documents.slice";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

import MS from "./ModifyQuestionModal.module.css";

interface CreateQuestionModalProps {
  onSave: (id: number, name: string) => void;
  onClose: () => void;
}

export const CreateQuestionModal = ({
  onSave,
  onClose,
}: CreateQuestionModalProps) => {
  const store = useStore();
  const dispatch = useDispatch();

  const [questionType, setQuestionType] = useState<
    "native" | "notebook" | undefined
  >();

  const { data } = useListDatabasesQuery();
  const databases = useMemo(() => data?.data ?? [], [data]);
  const hasDataAccess = useMemo(() => getHasDataAccess(databases), [databases]);
  const hasNativeWrite = useMemo(
    () => getHasNativeWrite(databases),
    [databases],
  );

  const [modifiedQuestion, setModifiedQuestion] = useState<Question>(() =>
    Question.create(),
  );

  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );

  const handleNewQuestion = (type: "native" | "notebook") => {
    setQuestionType(type);
  };

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
    try {
      const name =
        modifiedQuestion.displayName() ||
        modifiedQuestion.generateQueryDescription() ||
        "";

      const modifiedData = {
        name,
        database_id: modifiedQuestion.datasetQuery().database,
        dataset_query: modifiedQuestion.datasetQuery(),
        display: modifiedQuestion.display(),
        visualization_settings:
          modifiedQuestion.card().visualization_settings ?? {},
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

  if (questionType === "notebook") {
    return (
      <Modal opened onClose={onClose}>
        <Box h="70vh" className={MS.notebookContainer}>
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
      </Modal>
    );
  }

  if (questionType === "native") {
    return null; // TODO: implement this
  }

  return (
    <Modal
      opened
      onClose={onClose}
      size="80%"
      title={t`Create new question`}
      padding="lg"
    >
      <Flex gap="sm" mb="md">
        {hasDataAccess && (
          <Button
            variant="outline"
            className={S.newButton}
            leftSection={<Icon aria-hidden name="insight" />}
            onClick={() => handleNewQuestion("notebook")}
          >
            {t`New Question`}
          </Button>
        )}
        {hasNativeWrite && (
          <Button
            variant="outline"
            className={S.newButton}
            leftSection={<Icon aria-hidden name="sql" />}
            onClick={() => handleNewQuestion("native")}
          >
            {t`New SQL query`}
          </Button>
        )}
      </Flex>
    </Modal>
  );
};
