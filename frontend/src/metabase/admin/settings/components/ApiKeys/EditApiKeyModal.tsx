import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  useRegenerateApiKeyMutation,
  useUpdateApiKeyMutation,
} from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormGroupWidget,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import type { ApiKey, UpdateApiKeyRequest } from "metabase-types/api";

import { SecretKeyModal } from "./SecretKeyModal";
import { API_KEY_VALIDATION_SCHEMA } from "./utils";

const { fontFamilyMonospace } = getThemeOverrides();

type EditModalName = "edit" | "regenerate" | "secretKey";

const RegenerateKeyModal = ({
  apiKey,
  setModal,
  setSecretKey,
}: {
  apiKey: ApiKey;
  setModal: (name: EditModalName) => void;
  setSecretKey: (key: string) => void;
}) => {
  const [regenerateApiKey] = useRegenerateApiKeyMutation();
  const handleRegenerate = useCallback(async () => {
    const result = await regenerateApiKey(apiKey.id).unwrap();
    setSecretKey(result.unmasked_key);
    setModal("secretKey");
  }, [apiKey.id, setModal, setSecretKey, regenerateApiKey]);

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
                color="text-light"
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
                color="text-light"
                size="sm"
              >{t`Group`}</Text>
              <Text weight="bold" size="sm">
                {apiKey.group.name}
              </Text>
            </Stack>
            <Text>{t`Metabase will replace the existing API key with a new key. You won't be able to recover the old key.`}</Text>
            <FormErrorMessage />
            <Group position="right">
              <Button
                onClick={() => setModal("edit")}
              >{t`No, don't regenerate`}</Button>
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
  apiKey,
}: {
  onClose: () => void;
  apiKey: ApiKey;
}) => {
  const [modal, setModal] = useState<EditModalName>("edit");
  const [secretKey, setSecretKey] = useState<string>("");
  const [updateApiKey] = useUpdateApiKeyMutation();

  const handleSubmit = useCallback(
    async (vals: UpdateApiKeyRequest) => {
      await updateApiKey({
        id: vals.id,
        group_id: vals.group_id,
        name: vals.name,
      }).unwrap();
      onClose();
    },
    [onClose, updateApiKey],
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
          validationSchema={API_KEY_VALIDATION_SCHEMA}
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
                  label={t`Which group should this key belong to? The key will have the same permissions granted to that group.`}
                  size="sm"
                />
                <FormTextInput
                  name="masked_key"
                  label={t`API Key`}
                  size="sm"
                  styles={{
                    input: {
                      color: `black !important`,
                      fontFamily: fontFamilyMonospace as string,
                    },
                  }}
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
