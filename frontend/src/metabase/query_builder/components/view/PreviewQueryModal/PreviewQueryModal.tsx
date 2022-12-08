import React from "react";
import { t } from "ttag";
import Question from "metabase-lib/Question";
import NativeQueryModal from "../NativeQueryModal";

interface PreviewQueryModalProps {
  question: Question;
  onClose?: () => void;
}

const PreviewQueryModal = ({
  question,
  onClose,
}: PreviewQueryModalProps): JSX.Element => {
  return (
    <NativeQueryModal
      title={t`Query preview`}
      question={question}
      onClose={onClose}
    />
  );
};

export default PreviewQueryModal;
