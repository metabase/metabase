import { type ReactNode, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  Button,
  type ButtonProps,
  Flex,
  Modal,
  type ModalProps,
  Text,
} from "metabase/ui";

interface ConfirmModal extends ModalProps {
  title?: string | ReactNode;
  content?: string;
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
      <Flex direction="column" gap="lg" mt="md">
        {content ? <Text>{content}</Text> : null}
        <Text>{message}</Text>
        <Flex align="center" justify="space-between" gap="md">
          {errorMessage ? <Text c="danger">{errorMessage} </Text> : <div />}
          <Flex align="center" justify="flex-end" gap="md">
            {closeButtonText && (
              <Button {...closeButtonProps} onClick={onClose}>
                {closeButtonText}
              </Button>
            )}
            <Button
              color="danger"
              variant="filled"
              {...confirmButtonProps}
              disabled={confirmButtonProps.disabled || confirming}
              onClick={handleConfirm}
            >
              {confirmButtonText}
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Modal>
  );
};
