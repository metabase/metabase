import { useCallback } from "react";
import { t } from "ttag";

import { useDeleteApiKeyMutation } from "metabase/api";
import {
  FormProvider,
  Form,
  FormSubmitButton,
  FormErrorMessage,
} from "metabase/forms";
import { Text, Button, Group, Modal, Stack } from "metabase/ui";
import type { ApiKey } from "metabase-types/api";

export const DeleteApiKeyModal = ({
  onClose,
  apiKey,
}: {
  onClose: () => void;
  apiKey: ApiKey;
}) => {
  const [deleteApiKey] = useDeleteApiKeyMutation();

  const handleDelete = useCallback(async () => {
    await deleteApiKey(apiKey.id);
    onClose();
  }, [onClose, apiKey.id, deleteApiKey]);

  return (
    <Modal
      size="30rem"
      padding="xl"
      opened
      onClose={onClose}
      title={t`Delete API Key`}
    >
      <FormProvider initialValues={{}} onSubmit={handleDelete}>
        <Form>
          <Stack spacing="lg">
            <Text>{t`You won't be able to recover a deleted API key. You'll have to create a new key.`}</Text>
            <FormErrorMessage />
            <Group position="right">
              <Button
                color="error"
                onClick={onClose}
              >{t`No, don't delete`}</Button>
              <FormSubmitButton
                label={t`Delete API Key`}
                variant="filled"
                color="error"
              />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
};
