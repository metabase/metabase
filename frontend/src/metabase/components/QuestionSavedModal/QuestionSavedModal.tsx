import React from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";

interface QuestionSavedModalProps {
  onClose: () => void;
  addToDashboard: () => void;
}
const QuestionSavedModal = ({
  addToDashboard,
  onClose,
}: QuestionSavedModalProps) => {
  return (
    <ModalContent
      id="QuestionSavedModal"
      title={t`Saved! Add this to a dashboard?`}
      onClose={onClose}
      className="Modal-content Modal-content--small"
    >
      <div>
        <button
          className="Button Button--primary"
          onClick={addToDashboard}
        >{t`Yes please!`}</button>
        <button className="Button ml3" onClick={onClose}>{t`Not now`}</button>
      </div>
    </ModalContent>
  );
};

export default QuestionSavedModal;
