import { useEffect, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { getSetting } from "metabase/selectors/settings";
import { runQuestionQuery } from "metabase/services";
import { Button, Flex, Modal } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

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

  return (
    <Modal.Root opened={isOpen} size="70rem" onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>Notebook</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          {question && (
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
          )}
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
