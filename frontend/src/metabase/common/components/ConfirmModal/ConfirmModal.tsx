import { type ReactNode, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  Button,
  type ButtonProps,
  Modal,
  type ModalProps,
  Stack,
  Text,
} from "metabase/ui";

interface ConfirmModal extends Omit<ModalProps, "content"> {
  title?: string | ReactNode;
  content?: string | ReactNode;
  message?: string | ReactNode;
  onConfirm?: () => void | Promise<void>;
  confirmButtonText?: string;
  confirmButtonProps?: Omit<ButtonProps, "onClick" | "children">;
  closeButtonText?: string | null;
  closeButtonProps?: Omit<ButtonProps, "onClick" | "children">;
  errorMessage?: string;
}

export const ConfirmModal = ({
  title,
  content,
  message = t`Are you sure you want to do this?`,
  onClose,
  onConfirm = _.noop,
  confirmButtonText = t`Yes`,
  confirmButtonProps = {},
  closeButtonText = t`Cancel`,
  closeButtonProps = {},
  errorMessage,
  ...props
}: ConfirmModal) => {
  const [confirming, setConfirming] = useState(false);
  const handleConfirm = async () => {
    const confirm = onConfirm();
    try {
      if (confirm instanceof Promise) {
        setConfirming(true);
        await confirm;
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} size="lg" {...props}>
      <Stack gap="xl">
        {content ? <Text>{content}</Text> : null}
        <Text>{message}</Text>
      </Stack>
      <Modal.Footer>
        {errorMessage && (
          <Text c="feedback-negative" flex={1}>
            {errorMessage}
          </Text>
        )}
        {closeButtonText && (
          <Button {...closeButtonProps} onClick={onClose}>
            {closeButtonText}
          </Button>
        )}
        <Button
          color="negative"
          variant="filled"
          data-autofocus
          {...confirmButtonProps}
          disabled={confirmButtonProps.disabled || confirming}
          onClick={handleConfirm}
        >
          {confirmButtonText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
