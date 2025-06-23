import { t } from "ttag";

import { ErrorBox } from "metabase/common/components/ErrorDetails";
import { Modal, Text } from "metabase/ui";

// OSS Component, do not use directly, use through PLUGIN_UPLOAD_MANAGEMENT
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
