import type { ReactNode } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Button, Flex, Modal, Text } from "metabase/ui";

interface ConfirmModal {
  opened: boolean | undefined;
  "data-testid"?: string;
  title: string | ReactNode;
  content?: string;
  message?: string | ReactNode;
  onClose?: () => void;
  onConfirm?: () => void;
  confirmButtonText?: string;
  confirmButtonPrimary?: boolean;
}

export const ConfirmModal = ({
  opened,
  "data-testid": dataTestId,
  title,
  content,
  message = t`Are you sure you want to do this?`,
  onClose = _.noop,
  onConfirm = _.noop,
  confirmButtonText = t`Yes`,
  confirmButtonPrimary = false,
}: ConfirmModal) => (
  <Modal
    data-testid={dataTestId}
    opened={Boolean(opened)}
    title={title}
    onClose={onClose}
    size="lg"
  >
    <Flex direction="column" gap="lg" mt="lg">
      {content ? <Text>{content}</Text> : null}
      <Text>{message}</Text>
      <Flex justify="flex-end" gap="md">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          color={confirmButtonPrimary ? "primary" : "danger"}
          variant="filled"
          onClick={onConfirm}
        >
          {confirmButtonText}
        </Button>
      </Flex>
    </Flex>
  </Modal>
);
