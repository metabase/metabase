import { t } from "ttag";
import Modal from "metabase/components/Modal";
import ModalContent, {
  ModalContentActionIcon,
} from "metabase/components/ModalContent";
import ActionParametersInputForm, {
  ActionParametersInputFormProps,
} from "./ActionParametersInputForm";

interface ModalProps {
  title: string;
  showConfirmMessage?: boolean;
  confirmMessage?: string;
  onEdit?: () => void;
  onClose: () => void;
}

export type ActionParametersInputModalProps = ModalProps &
  ActionParametersInputFormProps;

function ActionParametersInputModal({
  title,
  showConfirmMessage,
  confirmMessage,
  onEdit,
  onClose,
  ...formProps
}: ActionParametersInputModalProps) {
  return (
    <Modal data-testid="action-parameters-input-modal" onClose={onClose}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionParametersInputModal;
