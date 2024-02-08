import { t } from "ttag";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import type Question from "metabase-lib/Question";

interface Props {
  isShowingNewbModal: boolean;
  question: Question;
  onClose: () => void;
}

export const SavedQuestionIntroModal = ({
  question,
  isShowingNewbModal,
  onClose,
}: Props) => {
  const isModel = question.isDataset();
  const title = isModel
    ? t`It's okay to play around with models`
    : t`It's okay to play around with saved questions`;
  const message = isModel
    ? t`You won't make any permanent changes to them unless you edit their query definition.`
    : t`You won't make any permanent changes to a saved question unless you click Save and choose to replace the original question.`;

  return (
    <Modal isOpen={isShowingNewbModal}>
      <ModalContent title={title} className="Modal-content text-centered py2">
        <div className="px2 pb2 text-paragraph">{message}</div>
        <div className="Form-actions flex justify-center py1">
          <button className="Button Button--primary" onClick={onClose}>
            {t`Okay`}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
};
