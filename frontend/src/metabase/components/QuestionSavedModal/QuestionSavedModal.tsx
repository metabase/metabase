import cx from "classnames";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

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
    >
      <div>
        <button
          className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
          onClick={addToDashboard}
        >{t`Yes please!`}</button>
        <button
          className={cx(ButtonsS.Button, CS.ml3)}
          onClick={onClose}
        >{t`Not now`}</button>
      </div>
    </ModalContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionSavedModal;
