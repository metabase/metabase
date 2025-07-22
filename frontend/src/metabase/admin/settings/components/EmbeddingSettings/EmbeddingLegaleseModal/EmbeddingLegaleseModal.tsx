import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { Button, Group, List, Modal, type ModalProps, Text } from "metabase/ui";

type SettingKey = "enable-embedding-sdk" | "enable-embedding-iframe-sdk";

type Props = ModalProps & {
  setting: SettingKey;
};

export const EmbeddingLegaleseModal = ({ setting, opened, onClose }: Props) => {
  const [loading, setLoading] = useState(false);
  const [updateSettings] = useUpdateSettingsMutation();

  const onAccept = async () => {
    setLoading(true);

    await updateSettings({
      [setting]: true,
      "show-sdk-embed-terms": false,
    });

    setLoading(false);
    onClose();
  };

  return (
    <Modal
      title={t`First, some legalese`}
      onClose={onClose}
      opened={opened}
      size={670}
      padding="xl"
      withCloseButton={false}
      closeOnClickOutside={false}
    >
      <Text mt="xs">{getTitle(setting)}</Text>
      <List mt="xs">
        <List.Item mr="md">
          <Text>{t`Sharing Metabase accounts is a security risk. Even if you filter data on the client side, each user could use their token to view any data visible to that shared user account.`}</Text>
        </List.Item>
        <List.Item mr="md">
          <Text>{t`That, and we consider shared accounts to be unfair usage. Fair usage involves giving each end-user of the embedded analytics their own Metabase account.`}</Text>
        </List.Item>
      </List>
      <Group justify="right" mt="lg">
        <Button
          onClick={onClose}
          variant="outline"
          disabled={loading}
        >{t`Decline and go back`}</Button>
        <Button
          onClick={onAccept}
          variant="filled"
          data-is-loading={loading}
          loading={loading}
        >{t`Agree and continue`}</Button>
      </Group>
    </Modal>
  );
};

const getTitle = (key: SettingKey) =>
  match(key)
    .with(
      "enable-embedding-sdk",
      () =>
        t`When using the Embedded analytics SDK for React, each end user should have their own Metabase account.`,
    )
    .with(
      "enable-embedding-iframe-sdk",
      () =>
        t`When using the new iframe embedding, each end user should have their own Metabase account.`,
    )
    .exhaustive();
