import React from "react";
import { t } from "ttag";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import ActionParametersInputForm, {
  ActionParametersInputFormProps,
} from "./ActionParametersInputForm";

interface ModalProps {
  title: string;
  showConfirmMessage?: boolean;
  confirmMessage?: string;
  onClose: () => void;
}

export type ActionParametersInputModalProps = ModalProps &
  ActionParametersInputFormProps;

function ActionParametersInputModal({
  title,
  showConfirmMessage,
  confirmMessage,
  onClose,
  ...formProps
}: ActionParametersInputModalProps) {
  return (
    <Modal onClose={onClose}>
      <ModalContent title={title} onClose={onClose}>
        <>
          {showConfirmMessage && <ConfirmMessage message={confirmMessage} />}
          <ActionParametersInputForm {...formProps} />
        </>
      </ModalContent>
    </Modal>
  );
}

const ConfirmMessage = ({ message }: { message?: string }) => (
  <div>{message ?? t`This action cannot be undone.`}</div>
);

export default ActionParametersInputModal;
