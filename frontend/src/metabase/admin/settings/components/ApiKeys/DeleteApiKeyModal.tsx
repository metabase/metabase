import { useCallback } from "react";
import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Modal, Text } from "metabase/ui";
import type { ApiKey } from "metabase-types/api";

import { useDeleteApiKeyMutation } from "../../api/api-key";

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
    <Modal size="30rem" opened onClose={onClose} title={t`Delete API key`}>
      <FormProvider initialValues={{}} onSubmit={handleDelete}>
        <Form>
          <Text>{t`You won't be able to recover a deleted API key. You'll have to create a new key.`}</Text>
          <Modal.Footer>
            <FormErrorMessage flex={1} />
            <Button onClick={onClose}>{t`No, don't delete`}</Button>
            <FormSubmitButton
              label={t`Delete API key`}
              variant="filled"
              color="negative"
            />
          </Modal.Footer>
        </Form>
      </FormProvider>
    </Modal>
  );
};
