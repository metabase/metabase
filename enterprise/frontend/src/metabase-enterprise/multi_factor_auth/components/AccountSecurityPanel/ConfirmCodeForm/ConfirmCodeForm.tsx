import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, type ButtonProps, Group, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";

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
  message: string;
  submitLabel: string;
  submitColor?: ButtonProps["color"];
  onSubmit: (code: string) => Promise<void>;
  onCancel: () => void;
};

export function ConfirmCodeForm({
  message,
  submitLabel,
  submitColor,
  onSubmit,
  onCancel,
}: ConfirmCodeFormProps) {
  const handleSubmit = ({ code }: ConfirmCodeValues) =>
    onSubmit(code.trim().toLowerCase());

  return (
    <FormProvider
      initialValues={INITIAL_CODE_VALUES}
      validationSchema={CONFIRM_CODE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="md">
          <Text c="text-secondary">{message}</Text>
          <FormTextInput
            name="code"
            label={t`Confirm with an authenticator code or a recovery code`}
            placeholder="123456"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={submitLabel}
              variant="filled"
              color={submitColor}
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
