import { t } from "ttag";
import { useCallback } from "react";

import type { ApiKey } from "metabase-types/api";

import {
  FormProvider,
  Form,
  FormSubmitButton,
  FormErrorMessage,
} from "metabase/forms";

import { Text, Button, Group, Modal, Stack } from "metabase/ui";
import { ApiKeysApi } from "metabase/services";

export const DeleteApiKeyModal = ({
  onClose,
  refreshList,
  apiKey,
}: {
  onClose: () => void;
  refreshList: () => void;
  apiKey: ApiKey;
}) => {
  const handleDelete = useCallback(async () => {
    await ApiKeysApi.delete({ id: apiKey.id });
    refreshList();
    onClose();
  }, [refreshList, onClose, apiKey.id]);

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
