import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormGroupWidget,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Modal, Paper, Stack, Text } from "metabase/ui";
import type { ApiKey, UpdateApiKeyRequest } from "metabase-types/api";

import {
  useRegenerateApiKeyMutation,
  useUpdateApiKeyMutation,
} from "../../api/api-key";

import S from "./EditApiKeyModal.module.css";
import { SecretKeyModal } from "./SecretKeyModal";
import { getApiKeyValidationSchema } from "./utils";

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
      size="40rem"
      opened
      onClose={() => setModal("edit")}
      title={t`Regenerate API key`}
    >
      <FormProvider initialValues={{}} onSubmit={handleRegenerate}>
        <Form>
          <Stack gap="xxl">
            <Stack gap="xxs">
              <Text
                component="label"
                c="text-secondary"
                fw="bold"
              >{t`Key name`}</Text>
              <Text>{apiKey.name}</Text>
            </Stack>
            <Stack gap="xxs">
              <Text
                component="label"
                c="text-secondary"
                fw="bold"
              >{t`Group`}</Text>
              <Text>{apiKey.group.name}</Text>
            </Stack>
            {/* TODO: swap for the planned metabase/ui Alert variant once it lands. */}
            <Paper
              bg="background_page-secondary"
              radius="sm"
              px="lg"
              py="sm"
              shadow="none"
            >
              <Text c="text-secondary">{t`Metabase will replace the existing API key with a new key. You won't be able to recover the old key.`}</Text>
            </Paper>
          </Stack>
          <Modal.Footer>
            <FormErrorMessage flex={1} />
            <Button
              onClick={() => setModal("edit")}
            >{t`No, don't regenerate`}</Button>
            <FormSubmitButton variant="filled" label={t`Regenerate`} />
          </Modal.Footer>
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
        size="40rem"
        density="relaxed"
        opened
        onClose={onClose}
        title={t`Edit API key`}
      >
        <FormProvider
          initialValues={{ ...apiKey, group_id: apiKey.group.id }}
          onSubmit={handleSubmit}
          validationSchema={getApiKeyValidationSchema()}
        >
          {({ dirty }) => (
            <Form>
              <Stack gap="xl">
                <FormTextInput name="name" label={t`Key name`} required />
                <FormGroupWidget
                  name="group_id"
                  label={t`Group this key should belong to`}
                  description={t`The key will have the same permissions that the group does.`}
                  classNames={{ description: S.groupDescription }}
                />
                <FormTextInput
                  name="masked_key"
                  label={t`API Key`}
                  styles={{
                    input: {
                      // override the disabled-gray so the masked key stays readable in both themes
                      color: "var(--mb-color-text-primary) !important",
                      fontFamily: "var(--mb-default-monospace-font-family)",
                    },
                  }}
                  disabled
                />
              </Stack>
              <Modal.Footer>
                <Button
                  mr="auto"
                  onClick={() => setModal("regenerate")}
                >{t`Regenerate API key`}</Button>
                <FormErrorMessage flex={1} />
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton
                  disabled={!dirty}
                  variant="filled"
                  label={t`Save`}
                />
              </Modal.Footer>
            </Form>
          )}
        </FormProvider>
      </Modal>
    );
  }
  return null;
};
