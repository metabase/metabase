import { t } from "ttag";

import { ErrorBox } from "metabase/common/components/ErrorDetails";
import { Modal, Text } from "metabase/ui";

export const _FileUploadErrorModal = ({
  onClose,
  fileName,
  children,
  opened,
}: {
  onClose: () => void;
  fileName?: string;
  children: string;
  opened: boolean;
}) => {
  return (
    <Modal
      opened={opened}
      size="md"
      title={t`Upload error details`}
      onClose={onClose}
    >
      {fileName && (
        <Text>{t`There were some errors while uploading ${fileName}:`}</Text>
      )}
      <ErrorBox>{children}</ErrorBox>
    </Modal>
  );
};
