import { t } from "ttag";

import { ErrorBox } from "metabase/components/ErrorDetails";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

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
