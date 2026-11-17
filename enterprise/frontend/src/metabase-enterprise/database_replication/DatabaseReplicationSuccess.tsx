import { t } from "ttag";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { Box, Button, Modal, type ModalStepProps, Text } from "metabase/ui";

export const getDatabaseReplicationSuccessModalProps = (): ModalStepProps => ({
  layout: "centered",
  title: t`Replication in progress`,
  illustration: (
    <Box h={96} w={96}>
      <MetabotLogo variant="cloud" />
    </Box>
  ),
});

export const DatabaseReplicationSuccess = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  return (
    <>
      <Text c="text-secondary">
        {t`The process runs in the background. Depending on the database size, this can take up to several hours. You will get an email once your data is ready to use.`}
      </Text>
      <Modal.Footer>
        <Button onClick={onClose} variant="filled">
          {t`Done`}
        </Button>
      </Modal.Footer>
    </>
  );
};
