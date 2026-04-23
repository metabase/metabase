import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { Button, Flex, Icon, Modal, Stack, Text } from "metabase/ui";

export function DeleteCollectedDataModal() {
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  return (
    <Stack gap="xs">
      <SettingHeader
        id="delete-user-data"
        title={t`Delete previously collected user data`}
        description={t`This will delete all recorded path, user agent, and IP address shown in your usage analytics.`}
      />

      <Flex>
        <Button
          variant="subtle"
          color="danger"
          pl={0}
          py={0}
          size="xs"
          leftSection={<Icon name="trash" />}
          onClick={() => openModal()}
        >
          {t`Delete`}
        </Button>
      </Flex>

      {modalOpened && (
        <Modal
          opened
          title={t`Delete previously collected user data?`}
          size="lg"
          onClose={closeModal}
        >
          <Text py="1rem">{t`This will delete all recorded path, user agent, and IP address. This action can’t be undone.`}</Text>
          <Flex justify="flex-end" gap="0.75rem">
            <Button onClick={closeModal}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              color="error"
              onClick={() => {}}
            >{t`Delete`}</Button>
          </Flex>
        </Modal>
      )}
    </Stack>
  );
}
