import cx from "classnames";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import type Question from "metabase-lib/v1/Question";

interface Props {
  isShowingNewbModal: boolean;
  question: Question;
  onClose: () => void;
}

const getLabels = (question: Question) => {
  const type = question.type();

  if (type === "question") {
    return {
      title: t`It's okay to play around with saved questions`,
      message: t`You won't make any permanent changes to a saved question unless you click Save and choose to replace the original question.`,
    };
  }

  if (type === "model") {
    return {
      title: t`It's okay to play around with models`,
      message: t`You won't make any permanent changes to them unless you edit their query definition.`,
    };
  }

  if (type === "metric") {
    return {
      title: t`It's okay to play around with metrics`,
      message: t`You won't make any permanent changes to them unless you edit their query definition.`,
    };
  }

  throw new Error(`Unknown question.type(): ${type}`);
};

export const SavedQuestionIntroModal = ({
  question,
  isShowingNewbModal,
  onClose,
}: Props) => {
  const { title, message } = getLabels(question);

  return (
    <Modal isOpen={isShowingNewbModal}>
      <ModalContent title={title} className={cx(CS.textCentered, CS.py2)}>
        <div className={cx(CS.px2, CS.pb2, CS.textParagraph)}>{message}</div>
        <div className={cx("Form-actions", CS.flex, CS.justifyCenter, CS.py1)}>
          <button
            className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
            onClick={onClose}
          >
            {t`Okay`}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
};
