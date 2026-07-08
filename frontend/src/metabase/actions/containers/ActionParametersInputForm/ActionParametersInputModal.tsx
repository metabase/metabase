import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import {
  ModalContent,
  ModalContentActionIcon,
} from "metabase/common/components/ModalContent";
import { Modal } from "metabase/ui";

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
  return (
    <Modal
      data-testid="action-parameters-input-modal"
      opened={opened}
      onClose={onClose}
      size="lg"
      withCloseButton={false}
      padding={0}
    >
      <ModalContent
        title={title}
        headerActions={
          onEdit ? (
            <ModalContentActionIcon
              name="pencil"
              tooltip={t`Edit this action`}
              onClick={onEdit}
            />
          ) : undefined
        }
        onClose={onClose}
      >
        <>
          {showEmptyState && (
            <EmptyState message={t`Choose a record to update`} />
          )}

          {!showEmptyState && (
            <>
              {showConfirmMessage && (
                <ConfirmMessage message={confirmMessage} />
              )}
              <ActionParametersInputForm {...formProps} />
            </>
          )}
        </>
      </ModalContent>
    </Modal>
  );
}

const ConfirmMessage = ({ message }: { message?: string }) => (
  <div>{message ?? t`This action cannot be undone.`}</div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionParametersInputModal;
