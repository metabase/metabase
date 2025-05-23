import { useState } from "react";
import { t } from "ttag";

import {
  Button,
  Group,
  List,
  Modal,
  type ModalProps,
  Text,
  Title,
} from "metabase/ui";

import type { AdminSettingComponentProps } from "../types";

export const EmbeddingSdkLegaleseModal = ({
  opened,
  onClose,
  updateSetting,
}: AdminSettingComponentProps & ModalProps) => {
  const [loading, setLoading] = useState(false);

  const onAccept = async () => {
    setLoading(true);
    await Promise.all([
      updateSetting({ key: "show-sdk-embed-terms" }, false),
      updateSetting({ key: "enable-embedding-sdk" }, true),
    ]);
    setLoading(false);
    onClose();
  };

  return (
    <Modal
      title={<Title order={3}>{t`First, some legalese`}</Title>}
      onClose={onClose}
      opened={opened}
      size={670}
      padding="xl"
      withCloseButton={false}
      closeOnClickOutside={false}
    >
      <Text mt="xs">
        {t`When using the Embedded analytics SDK for React, each end user should have their own Metabase account.`}
      </Text>
      <List mt="xs">
        <List.Item mr="md">
          <Text>{t`Sharing Metabase accounts is a security risk. Even if you filter data on the client side, each user could use their token to view any data visible to that shared user account.`}</Text>
        </List.Item>
        <List.Item mr="md">
          <Text>{t`That, and we consider shared accounts to be unfair usage. Fair usage of the SDK involves giving each end-user of the embedded analytics their own Metabase account.`}</Text>
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
