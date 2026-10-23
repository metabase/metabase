import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ActionIcon, Group, Icon, Modal, Text, Tooltip } from "metabase/ui";

import type { ActionParametersInputFormProps } from "./ActionParametersInputForm";
import ActionParametersInputForm from "./ActionParametersInputForm";

interface ModalProps {
  opened: boolean;
  title: string;
  showConfirmMessage?: boolean;
  showEmptyState: boolean;
  confirmMessage?: string;
  onEdit?: () => void;
  onClose: () => void;
}

export type ActionParametersInputModalProps = ModalProps &
  ActionParametersInputFormProps;

function ActionParametersInputModal({
  opened,
  showConfirmMessage,
  showEmptyState,
  title,
  confirmMessage,
  onEdit,
  onClose,
  ...formProps
}: ActionParametersInputModalProps) {
  // Unlike `Modal`, `Modal.Root` still renders its portal while closed, and
  // the action button keeps this mounted, so render nothing until it opens
  if (!opened) {
    return null;
  }

  return (
    <Modal.Root
      data-testid="action-parameters-input-modal"
      opened={opened}
      size="lg"
      density="relaxed"
      onClose={onClose}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{title}</Modal.Title>
          <Group gap="sm" wrap="nowrap">
            {onEdit && (
              <Tooltip label={t`Edit this action`}>
                <ActionIcon
                  variant="subtle"
                  aria-label={t`Edit this action`}
                  onClick={onEdit}
                >
                  <Icon name="pencil" />
                </ActionIcon>
              </Tooltip>
            )}
            <Modal.CloseButton />
          </Group>
        </Modal.Header>
        <Modal.Body>
          {showEmptyState ? (
            <EmptyState message={t`Choose a record to update`} />
          ) : (
            <>
              {showConfirmMessage && (
                <ConfirmMessage message={confirmMessage} />
              )}
              <ActionParametersInputForm {...formProps} />
            </>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

const ConfirmMessage = ({ message }: { message?: string }) => (
  <Text mb="xl">{message ?? t`This action cannot be undone.`}</Text>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionParametersInputModal;
