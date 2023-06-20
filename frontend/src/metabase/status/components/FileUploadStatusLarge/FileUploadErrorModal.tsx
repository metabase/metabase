import { t } from "ttag";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import { ErrorBox } from "metabase/components/ErrorDetails";

export const FileUploadErrorModal = ({
  onClose,
  children,
}: {
  onClose: () => void;
  children: string;
}) => {
  return (
    <Modal small>
      <ModalContent title={t`Upload error details`} onClose={onClose}>
        <ErrorBox>{children}</ErrorBox>
      </ModalContent>
    </Modal>
  );
};
