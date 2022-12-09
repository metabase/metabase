import React, { useCallback } from "react";
import { t } from "ttag";
import { getEngineNativeType } from "metabase/lib/engine";
import Button from "metabase/core/components/Button";
import Question from "metabase-lib/Question";
import NativeQueryModal, { useNativeQuery } from "../NativeQueryModal";

const MODAL_TITLE = {
  sql: t`SQL for this question`,
  json: t`Native query for this question`,
};

const BUTTON_TITLE = {
  sql: t`Convert this question to SQL`,
  json: t`Convert this question to a native query`,
};

interface UpdateQuestionOpts {
  shouldUpdateUrl?: boolean;
}

interface ConvertQueryModalProps {
  question: Question;
  onUpdateQuestion?: (question: Question, opts?: UpdateQuestionOpts) => void;
  onClose?: () => void;
}

const ConvertQueryModal = ({
  question,
  onUpdateQuestion,
  onClose,
}: ConvertQueryModalProps): JSX.Element => {
  const engineType = getEngineNativeType(question.database()?.engine);
  const { query, error, isLoading } = useNativeQuery(question);

  const handleConvertClick = useCallback(() => {
    if (!query) {
      return;
    }

    const newQuestion = question.setDatasetQuery({
      type: "native",
      native: { query, "template-tags": {} },
      database: question.datasetQuery().database,
    });

    onUpdateQuestion?.(newQuestion, { shouldUpdateUrl: true });
    onClose?.();
  }, [question, query, onUpdateQuestion, onClose]);

  return (
    <NativeQueryModal
      title={MODAL_TITLE[engineType]}
      query={query}
      error={error}
      isLoading={isLoading}
      onClose={onClose}
    >
      {query && (
        <Button primary onClick={handleConvertClick}>
          {BUTTON_TITLE[engineType]}
        </Button>
      )}
    </NativeQueryModal>
  );
};

export default ConvertQueryModal;
