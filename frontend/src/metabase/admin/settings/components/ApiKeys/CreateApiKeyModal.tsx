import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormGroupWidget,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { ApiKeysApi } from "metabase/services";
import { Text, Button, Group, Modal, Stack } from "metabase/ui";

import { SecretKeyModal } from "./SecretKeyModal";
import { API_KEY_VALIDATION_SCHEMA } from "./utils";

export const CreateApiKeyModal = ({
  onClose,
  refreshList,
}: {
  onClose: () => void;
  refreshList: () => void;
}) => {
  const [modal, setModal] = useState<"create" | "secretKey">("create");
  const [secretKey, setSecretKey] = useState<string>("");

  const handleSubmit = useCallback(
    async vals => {
      const response = await ApiKeysApi.create(vals);
      setSecretKey(response.unmasked_key);
      setModal("secretKey");
      refreshList();
    },
    [refreshList],
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
          initialValues={{ name: "", group_id: "" }}
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
