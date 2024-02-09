import { t } from "ttag";
import { Text } from "metabase/ui";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import { ErrorBox } from "metabase/components/ErrorDetails";

export const FileUploadErrorModal = ({
  onClose,
  fileName,
  children,
}: {
  onClose: () => void;
  fileName?: string;
  children: string;
}) => {
  return (
    <Modal small>
      <ModalContent title={t`Upload error details`} onClose={onClose}>
        {fileName && <Text>{t`Errors uploading ${fileName}:`}</Text>}
        <ErrorBox>{children}</ErrorBox>
      </ModalContent>
    </Modal>
  );
};
