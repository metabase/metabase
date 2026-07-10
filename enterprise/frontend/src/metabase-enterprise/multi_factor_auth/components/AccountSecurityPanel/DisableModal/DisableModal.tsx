import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Group, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useDisableMfaMutation } from "metabase-enterprise/api";

type DisableModalProps = {
  opened: boolean;
  onSuccess: () => void;
  onCancel: () => void;
};

export function DisableModal({
  opened,
  onSuccess,
  onCancel,
}: DisableModalProps) {
  return (
    <Modal
      title={t`Turn off two-factor authentication`}
      opened={opened}
      onClose={onCancel}
    >
      <DisableForm onSuccess={onSuccess} />
    </Modal>
  );
}

const DISABLE_SCHEMA = Yup.object({
  code: Yup.string().required(Errors.required),
});

type DisableFormValues = {
  code: string;
};

const INITIAL_DISABLE_VALUES: DisableFormValues = {
  code: "",
};

type DisableFormProps = {
  onSuccess: () => void;
};

function DisableForm({ onSuccess }: DisableFormProps) {
  const [disableMfa] = useDisableMfaMutation();

  const handleSubmit = async ({ code }: DisableFormValues) => {
    await disableMfa({ code: code.trim() }).unwrap();
    onSuccess();
  };

  return (
    <FormProvider
      initialValues={INITIAL_DISABLE_VALUES}
      validationSchema={DISABLE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="md">
          <Text c="text-secondary">
            {t`Are you sure you want to turn off two-factor authentication? Your account will be protected by your password only, and your recovery codes will stop working.`}
          </Text>
          <FormTextInput
            name="code"
            label={t`Confirm with an authenticator code or a recovery code`}
            placeholder="123456"
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <FormSubmitButton
              label={t`Turn off`}
              variant="filled"
              color="feedback-negative"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
