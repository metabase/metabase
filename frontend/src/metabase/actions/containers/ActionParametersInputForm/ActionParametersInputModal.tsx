import React from "react";
import { t } from "ttag";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import ActionParametersInputForm, {
  ActionParamatersInputFormProps,
} from "./ActionParametersInputForm";

interface ModalProps {
  onClose: () => void;
  title: string;
  showConfirmMessage?: boolean;
  confirmMessage?: string;
}

export default function ActionParametersInputModal({
  onClose,
  title,
  showConfirmMessage,
  confirmMessage,
  ...formProps
}: ModalProps & ActionParamatersInputFormProps) {
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
