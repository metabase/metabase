import { t } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";

interface ConfirmContentProps {
  "data-testid"?: string;
  title: string;
  content?: string | null;
  message?: string;
  onClose?: () => void;
  onAction?: () => void;
  onCancel?: () => void;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

const ConfirmContent = ({
  "data-testid": dataTestId,
  title,
  content = null,
  message = t`Are you sure you want to do this?`,
  onClose = _.noop,
  onAction = _.noop,
  onCancel = _.noop,
  confirmButtonText = t`Yes`,
  cancelButtonText = t`Cancel`,
}: ConfirmContentProps) => (
  <ModalContent
    data-testid={dataTestId}
    title={title}
    formModal
    onClose={() => {
      onCancel();
      onClose();
    }}
  >
    <div>{content}</div>

    <p className={CS.mb4}>{message}</p>

    <div className={CS.mlAuto}>
      <Button
        onClick={() => {
          onCancel();
          onClose();
        }}
      >
        {cancelButtonText}
      </Button>
      <Button
        danger
        className={CS.ml2}
        onClick={() => {
          onAction();
          onClose();
        }}
      >
        {confirmButtonText}
      </Button>
    </div>
  </ModalContent>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ConfirmContent;
