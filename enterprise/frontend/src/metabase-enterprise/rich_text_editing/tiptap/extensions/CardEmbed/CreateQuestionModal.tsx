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
import { NativeQueryModal } from "metabase-enterprise/rich_text_editing/tiptap/extensions/CardEmbed/NativeQueryModal";
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

  const [modifiedQuestion, setModifiedQuestion] = useState<Question>();

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

  const handleSaveStructuredQuestion = async () => {
    try {
      const name =
        modifiedQuestion.displayName() ||
        modifiedQuestion.generateQueryDescription() ||
        "";

      const dataset_query = modifiedQuestion.datasetQuery();

      const modifiedData = {
        name,
        database_id: dataset_query.database,
        dataset_query: dataset_query,
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

  const handleSaveNativeQuestion = async ({ card_id }) => {
    onSave(card_id, "New SQL query");
    onClose();
  };

  return (
    <>
      <Modal
        opened={!!modifiedQuestion && questionType === "notebook"}
        onClose={onClose}
        size="80%"
        title={t`Create new question`}
        padding="lg"
      >
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
          <Button variant="filled" onClick={handleSaveStructuredQuestion}>
            {t`Save and use`}
          </Button>
        </Flex>
      </Modal>

      {!!modifiedQuestion && questionType === "native" && (
        <NativeQueryModal
          isOpen
          card={modifiedQuestion.card()}
          onSave={handleSaveNativeQuestion}
          onClose={onClose}
        />
      )}

      <Modal
        opened={!questionType}
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
              onClick={() => {
                setModifiedQuestion(Question.create());
                handleNewQuestion("notebook");
              }}
            >
              {t`New Question`}
            </Button>
          )}
          {hasNativeWrite && (
            <Button
              variant="outline"
              className={S.newButton}
              leftSection={<Icon aria-hidden name="sql" />}
              onClick={() => {
                setModifiedQuestion(
                  Question.create({
                    DEPRECATED_RAW_MBQL_type: "native",
                    creationType: "native_question",
                  }),
                );
                handleNewQuestion("native");
              }}
            >
              {t`New SQL query`}
            </Button>
          )}
        </Flex>
      </Modal>
    </>
  );
};
