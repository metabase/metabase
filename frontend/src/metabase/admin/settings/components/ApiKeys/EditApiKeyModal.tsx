import { t } from "ttag";
import { useCallback, useState } from "react";

import type { ApiKey } from "metabase-types/api";

import { Text, Button, Group, Modal, Stack } from "metabase/ui";
import {
  Form,
  FormErrorMessage,
  FormGroupWidget,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { ApiKeysApi } from "metabase/services";

import { SecretKeyModal } from "./SecretKeyModal";

type EditModalName = "edit" | "regenerate" | "secretKey";

const RegenerateKeyModal = ({
  apiKey,
  setModal,
  setSecretKey,
  refreshList,
}: {
  apiKey: ApiKey;
  setModal: (name: EditModalName) => void;
  setSecretKey: (key: string) => void;
  refreshList: () => void;
}) => {
  const handleRegenerate = useCallback(async () => {
    const result = await ApiKeysApi.regenerate({ id: apiKey.id });
    setSecretKey(result.unmasked_key);
    setModal("secretKey");
    refreshList();
  }, [apiKey.id, refreshList, setModal, setSecretKey]);

  return (
    <Modal
      size="30rem"
      padding="xl"
      opened
      onClose={() => setModal("edit")}
      title={t`Regenerate API key`}
    >
      <FormProvider initialValues={{}} onSubmit={handleRegenerate}>
        <Form>
          <Stack spacing="lg">
            <Stack spacing="xs">
              <Text
                component="label"
                weight="bold"
                color="text.0"
                size="sm"
              >{t`Key name`}</Text>
              <Text weight="bold" size="sm">
                {apiKey.name}
              </Text>
            </Stack>
            <Stack spacing="xs">
              <Text
                component="label"
                weight="bold"
                color="text.0"
                size="sm"
              >{t`Group`}</Text>
              <Text weight="bold" size="sm">
                {apiKey.group.name}
              </Text>
            </Stack>
            <Text>{t`The existing API key will be deleted and cannot be recovered. It will be replaced with a new key.`}</Text>
            <FormErrorMessage />
            <Group position="right">
              <Button
                onClick={() => setModal("edit")}
              >{t`No, don’t regenerate`}</Button>
              <FormSubmitButton variant="filled" label={t`Regenerate`} />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
};

export const EditApiKeyModal = ({
  onClose,
  refreshList,
  apiKey,
}: {
  onClose: () => void;
  refreshList: () => void;
  apiKey: ApiKey;
}) => {
  const [modal, setModal] = useState<EditModalName>("edit");
  const [secretKey, setSecretKey] = useState<string>("");

  const handleSubmit = useCallback(
    async vals => {
      await ApiKeysApi.edit({
        id: vals.id,
        group_id: vals.group_id,
        name: vals.name,
      });
      refreshList();
      onClose();
    },
    [onClose, refreshList],
  );

  if (modal === "secretKey") {
    return <SecretKeyModal secretKey={secretKey} onClose={onClose} />;
  }

  if (modal === "regenerate") {
    return (
      <RegenerateKeyModal
        apiKey={apiKey}
        setModal={setModal}
        setSecretKey={setSecretKey}
        refreshList={refreshList}
      />
    );
  }

  if (modal === "edit") {
    return (
      <Modal
        size="30rem"
        padding="xl"
        opened
        onClose={onClose}
        title={t`Edit API Key`}
      >
        <FormProvider
          initialValues={{ ...apiKey, group_id: apiKey.group.id }}
          onSubmit={handleSubmit}
        >
          {({ dirty }) => (
            <Form>
              <Stack spacing="md">
                <FormTextInput
                  name="name"
                  label={t`Key name`}
                  size="sm"
                  required
                  withAsterisk={false}
                />
                <FormGroupWidget
                  name="group_id"
                  label={t`Select a group to inherit its permissions`}
                  size="sm"
                />
                <FormTextInput
                  name="masked_key"
                  label={t`API Key`}
                  size="sm"
                  styles={{ input: { fontFamily: "Monaco, monospace" } }}
                  disabled
                />
                <FormErrorMessage />
                <Group position="apart" mt="lg">
                  <Button
                    onClick={() => setModal("regenerate")}
                  >{t`Regenerate API Key`}</Button>
                  <Group position="right">
                    <Button onClick={onClose}>{t`Cancel`}</Button>
                    <FormSubmitButton
                      disabled={!dirty}
                      variant="filled"
                      label={t`Save`}
                    />
                  </Group>
                </Group>
              </Stack>
            </Form>
          )}
        </FormProvider>
      </Modal>
    );
  }
  return null;
};
