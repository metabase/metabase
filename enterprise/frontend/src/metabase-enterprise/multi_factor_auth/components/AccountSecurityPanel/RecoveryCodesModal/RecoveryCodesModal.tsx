import { useState } from "react";
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
import { useRegenerateRecoveryCodesMutation } from "metabase-enterprise/api";

import { RecoveryCodesForm } from "../RecoveryCodesForm";

type RecoveryCodesModalProps = {
  opened: boolean;
  onSuccess: () => void;
  onCancel: () => void;
};

export function RecoveryCodesModal({
  opened,
  onSuccess,
  onCancel,
}: RecoveryCodesModalProps) {
  return (
    <Modal
      title={t`Generate new recovery codes`}
      opened={opened}
      onClose={onCancel}
    >
      <RecoveryCodesModalBody onSuccess={onSuccess} />
    </Modal>
  );
}

type RecoveryCodesModalBodyProps = {
  onSuccess: () => void;
};

function RecoveryCodesModalBody({ onSuccess }: RecoveryCodesModalBodyProps) {
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  if (recoveryCodes != null) {
    return (
      <RecoveryCodesForm
        recoveryCodes={recoveryCodes}
        message={t`Your old recovery codes no longer work. Each new code signs you in once if you lose your authenticator — this is the only time they will be shown.`}
        onDone={onSuccess}
      />
    );
  }

  return <ConfirmCodeForm onGenerate={setRecoveryCodes} />;
}

const CONFIRM_CODE_SCHEMA = Yup.object({
  code: Yup.string().required(Errors.required),
});

type ConfirmCodeValues = {
  code: string;
};

const INITIAL_CODE_VALUES: ConfirmCodeValues = {
  code: "",
};

type ConfirmCodeFormProps = {
  onGenerate: (recoveryCodes: string[]) => void;
};

function ConfirmCodeForm({ onGenerate }: ConfirmCodeFormProps) {
  const [regenerateRecoveryCodes] = useRegenerateRecoveryCodesMutation();

  const handleSubmit = async ({ code }: ConfirmCodeValues) => {
    const { recovery_codes } = await regenerateRecoveryCodes({
      code: code.trim(),
    }).unwrap();
    onGenerate(recovery_codes);
  };

  return (
    <FormProvider
      initialValues={INITIAL_CODE_VALUES}
      validationSchema={CONFIRM_CODE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="md">
          <Text c="text-secondary">
            {t`This will generate a new set of recovery codes and invalidate all of your old ones.`}
          </Text>
          <FormTextInput
            name="code"
            label={t`Confirm with an authenticator code or a recovery code`}
            placeholder="123456"
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <FormSubmitButton label={t`Generate new codes`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
