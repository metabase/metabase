import _ from "underscore";

import { t } from "ttag";
import ModalContent from "metabase/components/ModalContent";

import Button from "metabase/core/components/Button";

interface ConfirmContentProps {
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
    title={title}
    formModal
    onClose={() => {
      onCancel();
      onClose();
    }}
  >
    <div>{content}</div>

    <p className="mb4">{message}</p>

    <div className="ml-auto">
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
        className="ml2"
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
