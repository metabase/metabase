import { useCallback, useState } from "react";
import { t } from "ttag";

import { useCreateApiKeyMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormGroupWidget,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Text, Button, Group, Modal, Stack } from "metabase/ui";
import type { CreateApiKeyRequest } from "metabase-types/api";

import { SecretKeyModal } from "./SecretKeyModal";
import { API_KEY_VALIDATION_SCHEMA } from "./utils";

export const CreateApiKeyModal = ({ onClose }: { onClose: () => void }) => {
  const [modal, setModal] = useState<"create" | "secretKey">("create");
  const [createApiKey, response] = useCreateApiKeyMutation();
  const secretKey = response?.data?.unmasked_key || "";

  const handleSubmit = useCallback(
    async (vals: { group_id: number | null; name: string }) => {
      if (vals.group_id !== null) {
        await createApiKey(vals as CreateApiKeyRequest);
        setModal("secretKey");
      }
    },
    [createApiKey],
  );

  if (modal === "secretKey") {
    return <SecretKeyModal secretKey={secretKey} onClose={onClose} />;
  }

  if (modal === "create") {
    return (
      <Modal
        size="30rem"
        padding="xl"
        opened
        onClose={onClose}
        title={t`Create a new API Key`}
      >
        <FormProvider
          initialValues={{ name: "", group_id: null }}
          validationSchema={API_KEY_VALIDATION_SCHEMA}
          onSubmit={handleSubmit}
        >
          <Form data-testid="create-api-key-modal">
            <Stack spacing="md">
              <FormTextInput
                name="name"
                label={t`Key name`}
                size="sm"
                required
                maxLength={250}
              />
              <FormGroupWidget
                name="group_id"
                label={t`Which group should this key belong to? The key will have the same permissions granted to that group.`}
                size="sm"
                required
              />
              <Text
                my="sm"
                size="sm"
              >{t`We don't version the Metabase API. We rarely change API endpoints, and almost never remove them, but if you write code that relies on the API, there's a chance you might have to update your code in the future.`}</Text>
              <FormErrorMessage />
              <Group position="right">
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton variant="filled" label={t`Create`} />
              </Group>
            </Stack>
          </Form>
        </FormProvider>
      </Modal>
    );
  }
  return null;
};
