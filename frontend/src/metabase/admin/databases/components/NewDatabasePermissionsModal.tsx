import { Link } from "react-router";
import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";
import type { Database } from "metabase-types/api";

export const NewDatabasePermissionsModal = ({
  opened,
  onClose,
  database,
}: {
  opened: boolean;
  onClose: () => void;
  database: Database;
}) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={620}
      withCloseButton={false}
      title={t`Your database was added! Want to configure permissions?`}
      padding="2rem"
    >
      <Text
        mb="1.5rem"
        mt="1rem"
      >{t`You can change these settings later in the Permissions tab. Do you want to configure it?`}</Text>
      <Flex justify="end">
        <Button mr="0.5rem" onClick={onClose}>{t`Maybe later`}</Button>
        <Button
          component={Link}
          variant="filled"
          to={`/admin/permissions/data/database/${database.id}`}
        >{t`Configure permissions`}</Button>
      </Flex>
    </Modal>
  );
};
