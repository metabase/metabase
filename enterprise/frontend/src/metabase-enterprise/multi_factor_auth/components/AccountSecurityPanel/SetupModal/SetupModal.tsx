import { useState } from "react";
import QRCode from "react-qr-code";
import { jt, t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Button, Center, Group, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useConfirmMfaEnrollmentMutation,
  useEnrollMfaMutation,
} from "metabase-enterprise/api";
import type { MfaEnrollResponse } from "metabase-types/api";

import { TOTP_CODE_LENGTH } from "../../../constants";
import { withTotpCodeRules } from "../../../schemas";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { RecoveryCodesForm } from "../RecoveryCodesForm";

const QR_CODE_SIZE = 180;

type SetupModalProps = {
  opened: boolean;
  onSuccess: () => void;
  onCancel: () => void;
};

export function SetupModal({ opened, onSuccess, onCancel }: SetupModalProps) {
  return (
    <Modal
      title={t`Set up two-factor authentication`}
      opened={opened}
      onClose={onCancel}
    >
      <SetupModalBody onSuccess={onSuccess} onCancel={onCancel} />
    </Modal>
  );
}

type SetupModalBodyProps = {
  onSuccess: () => void;
  onCancel: () => void;
};

function SetupModalBody({ onSuccess, onCancel }: SetupModalBodyProps) {
  const [enrollment, setEnrollment] = useState<MfaEnrollResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  if (recoveryCodes != null) {
    return (
      <RecoveryCodesForm
        recoveryCodes={recoveryCodes}
        message={jt`Each code signs you in once if you lose your authenticator. Save them somewhere safe — ${(
          <Box
            component="span"
            key="warning"
            c="text-primary"
            fw="bold"
          >{t`this is the only time they'll be shown.`}</Box>
        )}`}
        onDone={onSuccess}
      />
    );
  }

  if (enrollment == null) {
    return <ConfirmPasswordForm onEnroll={setEnrollment} onCancel={onCancel} />;
  }

  return (
    <EnrollForm
      enrollment={enrollment}
      onSuccess={setRecoveryCodes}
      onCancel={onCancel}
    />
  );
}

const PASSWORD_SCHEMA = Yup.object({
  password: Yup.string().required(Errors.required),
});

type ConfirmPasswordValues = {
  password: string;
};

const INITIAL_PASSWORD_VALUES: ConfirmPasswordValues = {
  password: "",
};

type ConfirmPasswordFormProps = {
  onEnroll: (enrollment: MfaEnrollResponse) => void;
  onCancel: () => void;
};

function ConfirmPasswordForm({ onEnroll, onCancel }: ConfirmPasswordFormProps) {
  const [enrollMfa] = useEnrollMfaMutation();

  const handleSubmit = async ({ password }: ConfirmPasswordValues) => {
    onEnroll(await enrollMfa({ password }).unwrap());
  };

  return (
    <FormProvider
      initialValues={INITIAL_PASSWORD_VALUES}
      validationSchema={PASSWORD_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="md">
          <Text c="text-secondary">
            {t`Protect your account by requiring a code from an authenticator app when you sign in.`}
          </Text>
          <FormTextInput
            name="password"
            type="password"
            label={t`Confirm your password to begin`}
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Continue`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

const CODE_SCHEMA = Yup.object({
  code: withTotpCodeRules(Yup.string().required(Errors.required)),
});

type EnrollFormValues = {
  code: string;
};

const INITIAL_CODE_VALUES: EnrollFormValues = {
  code: "",
};

type EnrollFormProps = {
  enrollment: MfaEnrollResponse;
  onSuccess: (recoveryCodes: string[]) => void;
  onCancel: () => void;
};

function EnrollForm({ enrollment, onSuccess, onCancel }: EnrollFormProps) {
  const [confirmEnrollment] = useConfirmMfaEnrollmentMutation();

  const handleSubmit = async ({ code }: EnrollFormValues) => {
    const { recovery_codes } = await confirmEnrollment({
      code: code.trim(),
    }).unwrap();
    onSuccess(recovery_codes);
  };

  return (
    <FormProvider
      initialValues={INITIAL_CODE_VALUES}
      validationSchema={CODE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="md">
          <Stack gap="sm">
            <Box>{t`Scan this QR code with an authenticator app:`}</Box>
            <Center>
              <Box bg="white" p="md">
                <QRCode value={enrollment.otpauth_uri} size={QR_CODE_SIZE} />
              </Box>
            </Center>
          </Stack>
          <Stack gap="sm">
            <Box>{t`Or enter this key in the app manually:`}</Box>
            <CopyableCodeBlock codes={[enrollment.secret]} />
          </Stack>
          <FormTextInput
            name="code"
            label={t`Enter the 6-digit code from the authenticator app`}
            placeholder="123456"
            maxLength={TOTP_CODE_LENGTH}
            inputMode="numeric"
            autoFocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Set up authentication`}
              variant="filled"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
