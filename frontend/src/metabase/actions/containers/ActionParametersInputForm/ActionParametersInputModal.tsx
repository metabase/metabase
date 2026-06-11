import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import {
  ModalContent,
  ModalContentActionIcon,
} from "metabase/common/components/ModalContent";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { Modal } from "metabase/ui";

import type { ActionParametersInputFormProps } from "./ActionParametersInputForm";
import ActionParametersInputForm from "./ActionParametersInputForm";

interface ModalProps {
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
  showConfirmMessage,
  showEmptyState,
  title,
  confirmMessage,
  onEdit,
  onClose,
  ...formProps
}: ActionParametersInputModalProps) {
  // manual Esc handling lets the action editor modal stack on top of this one
  useEscapeToCloseModal(onClose);

  return (
    <Modal
      opened
      size="640px"
      padding={0}
      withCloseButton={false}
      closeOnEscape={false}
      data-testid="action-parameters-input-modal"
      onClose={onClose}
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
