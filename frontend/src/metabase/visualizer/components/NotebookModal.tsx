import { useEffect, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { getSetting } from "metabase/selectors/settings";
import { runQuestionQuery } from "metabase/services";
import { Button, Flex, Modal } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";

interface NotebookModalProps {
  question?: Question | null;
  onChange: (question: Question) => void;
  onClose: () => void;
}

export function NotebookModal({
  question: _question,
  onChange,
  onClose,
}: NotebookModalProps) {
  const [question, setQuestion] = useState(_question);

  const reportTimezone = useSelector(state =>
    getSetting(state, "report-timezone-long"),
  );

  const isOpen = Boolean(question);
  const isDirty =
    question && _question && question.isDirtyComparedTo(_question);
  const isNative = Boolean(
    question && Lib.queryDisplayInfo(question.query()).isNative,
  );

  useEffect(() => {
    setQuestion(_question);
  }, [_question]);

  const handleRunQuery = () => {
    return runQuestionQuery(question);
  };

  const handleSave = () => {
    if (question) {
      onChange(question);
    }
    onClose();
  };

  const handleChangeNativeQuery = (query: NativeQuery) => {
    if (question) {
      const nextQuestion = question.setDatasetQuery(query.datasetQuery());
      setQuestion(nextQuestion);
    }
  };

  const renderEditorBody = () => {
    if (!question) {
      return null;
    }
    if (isNative) {
      return (
        <NativeQueryEditor
          question={question}
          query={question.legacyQuery()}
          viewHeight="full"
          enableRun={false}
          isNativeEditorOpen
          hasParametersList={false}
          hasEditingSidebar={false}
          resizable={false}
          readOnly={false}
          setDatasetQuery={handleChangeNativeQuery}
          runQuestionQuery={handleRunQuery}
        />
      );
    }
    return (
      <Notebook
        question={question}
        isRunnable
        isDirty={false}
        isResultDirty={false}
        hasVisualizeButton={false}
        reportTimezone={reportTimezone}
        runQuestionQuery={handleRunQuery}
        updateQuestion={setQuestion}
      />
    );
  };

  return (
    <Modal.Root opened={isOpen} size="70rem" onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{question?.displayName?.() ?? t`Editor`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          {renderEditorBody()}
          <Flex direction="row" justify="flex-end" gap="sm" p="md">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              disabled={!isDirty}
              onClick={handleSave}
            >{t`Save`}</Button>
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
