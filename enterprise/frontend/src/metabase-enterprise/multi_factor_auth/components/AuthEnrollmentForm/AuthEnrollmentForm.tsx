import { useState } from "react";
import { jt, t } from "ttag";
import * as Yup from "yup";

import { AuthTextButton } from "metabase/auth/components/AuthButton";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import type { AuthEnrollmentFormProps } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { completeLogin } from "metabase/redux/auth";
import { Box, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useEnrollMfaOnLoginMutation } from "metabase-enterprise/api";

import { TOTP_CODE_LENGTH } from "../../constants";
import { withTotpCodeRules } from "../../schemas";
import { RecoveryCodesForm } from "../common/RecoveryCodesForm";
import { TotpEnrollInstructions } from "../common/TotpEnrollInstructions";

const ENROLL_SCHEMA = Yup.object({
  code: withTotpCodeRules(Yup.string().required(Errors.required)),
});

type EnrollValues = { code: string };

const INITIAL_VALUES: EnrollValues = { code: "" };

export function AuthEnrollmentForm({
  enrollmentToken,
  secret,
  otpauthUri,
  remember,
  onCancel,
}: AuthEnrollmentFormProps) {
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  return (
    <Stack mt="2.5rem" gap="md">
      {recoveryCodes ? (
        <RecoveryCodesStep recoveryCodes={recoveryCodes} />
      ) : (
        <EnrollStep
          enrollmentToken={enrollmentToken}
          secret={secret}
          otpauthUri={otpauthUri}
          remember={remember}
          onEnrolled={setRecoveryCodes}
          onCancel={onCancel}
        />
      )}
    </Stack>
  );
}

type EnrollStepProps = Omit<AuthEnrollmentFormProps, "onCancel"> & {
  onEnrolled: (recoveryCodes: string[]) => void;
  onCancel: () => void;
};

function EnrollStep({
  enrollmentToken,
  secret,
  otpauthUri,
  remember,
  onEnrolled,
  onCancel,
}: EnrollStepProps) {
  const [enrollMfaOnLogin] = useEnrollMfaOnLoginMutation();

  const handleSubmit = async ({ code }: EnrollValues) => {
    const { recovery_codes } = await enrollMfaOnLogin({
      enrollment_token: enrollmentToken,
      code: code.trim(),
      remember,
    }).unwrap();

    onEnrolled(recovery_codes);
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={ENROLL_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ isSubmitting }) => (
        <Form>
          <Stack gap="md">
            <Text c="text-secondary" ta="center">
              {t`Two-factor authentication is required. Finish setting it up to sign in.`}
            </Text>
            <TotpEnrollInstructions otpauthUri={otpauthUri} secret={secret} />
            <FormTextInput
              name="code"
              label={t`Enter the 6-digit code from the authenticator app`}
              placeholder="123456"
              maxLength={TOTP_CODE_LENGTH}
              inputMode="numeric"
              autoFocus
            />
            <FormSubmitButton
              label={t`Set up authentication`}
              variant="filled"
              w="100%"
            />
            <FormErrorMessage ta="center" />
            <Box ta="center">
              <AuthTextButton disabled={isSubmitting} onClick={onCancel}>
                {t`Back to log in`}
              </AuthTextButton>
            </Box>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

type RecoveryCodesStepProps = {
  recoveryCodes: string[];
};

function RecoveryCodesStep({ recoveryCodes }: RecoveryCodesStepProps) {
  const dispatch = useDispatch();

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
      onDone={() => dispatch(completeLogin())}
    />
  );
}
