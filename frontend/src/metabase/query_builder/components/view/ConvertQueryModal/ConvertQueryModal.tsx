import React from "react";
import { t } from "ttag";
import { getEngineNativeType } from "metabase/lib/engine";
import Question from "metabase-lib/Question";
import NativeQueryModal from "../NativeQueryModal";

const ENGINE_TITLE = {
  sql: t`SQL for this question`,
  json: t`Native query for this question`,
};

interface ConvertQueryModalProps {
  question: Question;
  onClose?: () => void;
}

const ConvertQueryModal = ({
  question,
  onClose,
}: ConvertQueryModalProps): JSX.Element => {
  const engine = question.database()?.engine;
  const engineType = getEngineNativeType(engine);

  return (
    <NativeQueryModal
      title={ENGINE_TITLE[engineType]}
      question={question}
      onClose={onClose}
    />
  );
};

export default ConvertQueryModal;
