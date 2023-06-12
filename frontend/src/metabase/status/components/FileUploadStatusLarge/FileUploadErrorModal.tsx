import { t } from "ttag";
import { Box } from "@mantine/core";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

export const FileUploadErrorModal = ({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) => {
  return (
    <Modal small>
      <ModalContent title={t`Upload error details`} onClose={onClose}>
        <Box p="md">{children}</Box>
      </ModalContent>
    </Modal>
  );
};
