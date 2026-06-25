import { useCallback } from "react";
import { t } from "ttag";

import { useCreateApiKeyMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormGroupWidget,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Group, Modal, Paper, Stack, Text } from "metabase/ui";
import type { CreateApiKeyRequest } from "metabase-types/api";

import S from "./CreateApiKeyModal.module.css";
import { SecretKeyModal } from "./SecretKeyModal";
import { API_KEY_VALIDATION_SCHEMA } from "./utils";

export const CreateApiKeyModal = ({ onClose }: { onClose: () => void }) => {
  const [createApiKey, response] = useCreateApiKeyMutation();
  const secretKey = response?.data?.unmasked_key || "";

  const handleSubmit = useCallback(
    async (vals: { group_id: number | null; name: string }) => {
      if (vals.group_id !== null) {
        await createApiKey(vals as CreateApiKeyRequest).unwrap();
      }
    },
    [createApiKey],
  );

  if (response.isSuccess) {
    return <SecretKeyModal secretKey={secretKey} onClose={onClose} />;
  }

  if (response.isUninitialized || response.isLoading || response.isError) {
    return (
      <Modal
        size="40rem"
        padding="xl"
        opened
        onClose={onClose}
        title={t`Create a new API key`}
      >
        <FormProvider
          initialValues={{ name: "", group_id: null }}
          validationSchema={API_KEY_VALIDATION_SCHEMA}
          onSubmit={handleSubmit}
        >
          <Form data-testid="create-api-key-modal">
            <Stack gap="xl">
              <FormTextInput
                name="name"
                label={t`Key name`}
                placeholder={t`Something to help you remember what this is for`}
                required
                maxLength={250}
              />
              <FormGroupWidget
                name="group_id"
                label={t`Group this key should belong to`}
                description={t`The key will have the same permissions that the group does.`}
                classNames={{ description: S.groupDescription }}
                required
              />
              {/* TODO: swap for the planned metabase/ui Alert variant once it lands. */}
              <Paper
                bg="background_page-secondary"
                radius="md"
                px="md"
                py="sm"
                shadow="none"
              >
                <Text c="text-secondary">{t`We don't version the Metabase API. We rarely change API endpoints, and almost never remove them, but if you write code that relies on the API, there's a chance you might have to update your code in the future.`}</Text>
              </Paper>
              <FormErrorMessage />
              <Group justify="flex-end">
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
