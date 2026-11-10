import { t } from "ttag";

import { useDeleteActionSecretMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Modal, Text } from "metabase/ui";
import type { ActionSecret } from "metabase-types/api";

type DeleteActionSecretModalProps = {
  secret: ActionSecret;
  onClose: () => void;
};

export function DeleteActionSecretModal({
  secret,
  onClose,
}: DeleteActionSecretModalProps) {
  const [deleteSecret] = useDeleteActionSecretMutation();
  const { sendSuccessToast } = useMetadataToasts();

  const handleSubmit = async () => {
    await deleteSecret(secret.id).unwrap();
    sendSuccessToast(t`Secret deleted`);
    onClose();
  };

  return (
    <Modal title={t`Delete ${secret.name}?`} opened onClose={onClose}>
      <FocusTrap.InitialFocus />
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Text>
            {t`Actions that use {{secrets.${secret.name}}} will fail until you create it again. This can't be undone.`}
          </Text>
          <Modal.Footer>
            <FormErrorMessage flex={1} />
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Delete`}
              variant="filled"
              color="negative"
            />
          </Modal.Footer>
        </Form>
      </FormProvider>
    </Modal>
  );
}
