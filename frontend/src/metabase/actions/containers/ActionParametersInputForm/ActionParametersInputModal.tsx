import { t } from "ttag";
import { forwardRef, Ref } from "react";
import Modal from "metabase/components/Modal";
import ModalContent, {
  ModalContentActionIcon,
} from "metabase/components/ModalContent";
import { ActionFormRefData } from "metabase/actions/components/ActionForm/ActionForm";
import ActionParametersInputForm, {
  ActionParametersInputFormProps,
} from "./ActionParametersInputForm";

interface ModalProps {
  title: string;
  showConfirmMessage?: boolean;
  confirmMessage?: string;
  onActionEdit?: () => void;
  onClose: () => void;
}

export type ActionParametersInputModalProps = ModalProps &
  ActionParametersInputFormProps;

const ActionParametersInputModal = forwardRef(
  function ActionParametersInputModal(
    {
      title,
      showConfirmMessage,
      confirmMessage,
      onActionEdit,
      onClose,
      ...formProps
    }: ActionParametersInputModalProps,
    ref: Ref<ActionFormRefData>,
  ) {
    return (
      <Modal onClose={onClose}>
        <ModalContent
          title={title}
          headerActions={
            onActionEdit ? (
              <ModalContentActionIcon name="pencil" onClick={onActionEdit} />
            ) : undefined
          }
          onClose={onClose}
        >
          <>
            {showConfirmMessage && <ConfirmMessage message={confirmMessage} />}
            <ActionParametersInputForm {...formProps} ref={ref} />
          </>
        </ModalContent>
      </Modal>
    );
  },
);

const ConfirmMessage = ({ message }: { message?: string }) => (
  <div>{message ?? t`This action cannot be undone.`}</div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionParametersInputModal;
