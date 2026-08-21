import { useState } from "react";
import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/settings";
import { Button, Group, Modal, type ModalProps, Text } from "metabase/ui";

export const EmbeddingLegaleseModal = ({ opened, onClose }: ModalProps) => {
  const [loading, setLoading] = useState(false);
  const [updateSettings] = useUpdateSettingsMutation();

  const onAccept = async () => {
    setLoading(true);

    await updateSettings({
      "enable-embedding-modular": true,
      "show-modular-embed-terms": false,
    });

    setLoading(false);
    onClose();
  };

  return (
    <Modal
      title={t`Each end user needs their own Metabase account`}
      onClose={onClose}
      opened={opened}
      size={670}
      padding="xl"
      withCloseButton={false}
      closeOnClickOutside={false}
    >
      <Text mt="xs">{t`When you embed Metabase, each person who uses your app needs their own Metabase account. That's because sharing a single account between users is a security risk. Filtering data on the client side doesn't solve it, since anyone with that account's token can reach anything the account can see. Additionally, we consider shared accounts to be unfair usage.`}</Text>
      <Group justify="right" mt="lg">
        <Button
          onClick={onClose}
          variant="subtle"
          radius="sm"
          disabled={loading}
        >{t`Cancel`}</Button>
        <Button
          onClick={onAccept}
          variant="filled"
          data-is-loading={loading}
          loading={loading}
        >{t`Agree`}</Button>
      </Group>
    </Modal>
  );
};
