import React from "react";
import { t } from "ttag";
import { getEngineNativeType } from "metabase/lib/engine";
import Button from "metabase/core/components/Button";
import Question from "metabase-lib/Question";
import NativeQueryModal, { useNativeQuery } from "../NativeQueryModal";

const ENGINE_TITLE = {
  sql: t`SQL for this question`,
  json: t`Native query for this question`,
};

const ENGINE_BUTTON = {
  sql: t`Convert this question to SQL`,
  json: t`Convert this question to a native query`,
};

interface ConvertQueryModalProps {
  question: Question;
  onUpdateQuestion?: () => void;
  onClose?: () => void;
}

const ConvertQueryModal = ({
  question,
  onClose,
}: ConvertQueryModalProps): JSX.Element => {
  const engineType = getEngineNativeType(question.database()?.engine);
  const { query, error, isLoading } = useNativeQuery(question);

  return (
    <NativeQueryModal
      title={ENGINE_TITLE[engineType]}
      query={query}
      error={error}
      isLoading={isLoading}
      onClose={onClose}
    >
      {query && <Button primary>{ENGINE_BUTTON[engineType]}</Button>}
    </NativeQueryModal>
  );
};

export default ConvertQueryModal;
