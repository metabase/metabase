import type { ReactNode } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Button, Flex, Modal, Text } from "metabase/ui";

interface ConfirmContentProps {
  opened: boolean | undefined;
  "data-testid"?: string;
  title: string | ReactNode;
  content?: string | null;
  message?: string | ReactNode;
  onClose?: () => void;
  onConfirm?: () => void;
  confirmButtonText?: string;
  confirmButtonPrimary?: boolean;
}

export const ConfirmationModal = ({
  opened,
  "data-testid": dataTestId,
  title,
  content = null,
  message = t`Are you sure you want to do this?`,
  onClose = _.noop,
  onConfirm = _.noop,
  confirmButtonText = t`Yes`,
  confirmButtonPrimary = false,
}: ConfirmContentProps) => (
  <Modal.Root opened={Boolean(opened)} onClose={onClose} size="35rem">
    <Modal.Overlay />
    <Modal.Content data-testid={dataTestId}>
      <Modal.Header p="2.5rem 3rem" mb="sm">
        <Modal.Title fz="1rem" color="text-primary">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body p="2.5rem 3rem">
        <Text lh="1.5rem" mb={"lg"}>
          {content}
        </Text>
        <Text lh="1.5rem" mb={"lg"}>
          {message}
        </Text>
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
      </Modal.Body>
    </Modal.Content>
  </Modal.Root>
);
