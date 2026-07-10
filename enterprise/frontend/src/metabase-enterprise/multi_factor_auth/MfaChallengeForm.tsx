import { t } from "ttag";
import * as Yup from "yup";

import { AuthButton } from "metabase/auth/components/AuthButton";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import type { MfaChallengeFormProps } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { openNavbar } from "metabase/redux/app";
import { refreshSession } from "metabase/redux/auth";
import { Box, Stack, Text } from "metabase/ui";
import { isSmallScreen } from "metabase/utils/dom";
import * as Errors from "metabase/utils/errors";
import {
  useSendEmailOtpMutation,
  useVerifyMfaMutation,
} from "metabase-enterprise/api";

import { RECOVERY_CODE_LENGTH, TOTP_CODE_LENGTH } from "./constants";

const CHALLENGE_SCHEMA = Yup.object({
  code: Yup.string()
    .required(Errors.required)
    .when("useRecoveryCode", {
      is: false,
      then: (schema) =>
        schema
          .matches(/^\d*$/, () => t`must contain only digits`)
          .length(TOTP_CODE_LENGTH, Errors.exactLength),
    }),
  useRecoveryCode: Yup.boolean(),
});

type ChallengeCodeValues = {
  code: string;
  useRecoveryCode: boolean;
};

function ChallengeCodeForm({
  mfaToken,
  remember,
}: Pick<MfaChallengeFormProps, "mfaToken" | "remember">) {
  const dispatch = useDispatch();
  const [verifyMfa] = useVerifyMfaMutation();

  const handleSubmit = async ({ code }: ChallengeCodeValues) => {
    await verifyMfa({
      mfa_token: mfaToken,
      code: code.trim(),
      remember,
    }).unwrap();
    // The session cookie is now set; refresh and let the route guard redirect.
    await dispatch(refreshSession()).unwrap();
    if (!isSmallScreen()) {
      dispatch(openNavbar());
    }
  };

  return (
    <FormProvider<ChallengeCodeValues>
      initialValues={{ code: "", useRecoveryCode: false }}
      validationSchema={CHALLENGE_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values: { useRecoveryCode }, setFieldValue, setFieldTouched }) => (
        <Form>
          <Stack gap="md">
            <Text c="text-secondary" ta="center">
              {useRecoveryCode
                ? t`Enter one of your recovery codes.`
                : t`Enter the 6-digit code from your authenticator app.`}
            </Text>
            <FormTextInput
              name="code"
              aria-label={
                useRecoveryCode ? t`Recovery code` : t`Authenticator code`
              }
              placeholder={useRecoveryCode ? "xxxxx-xxxxx" : "123456"}
              maxLength={
                useRecoveryCode ? RECOVERY_CODE_LENGTH : TOTP_CODE_LENGTH
              }
              inputMode={useRecoveryCode ? "text" : "numeric"}
              autoFocus
            />
            <FormSubmitButton label={t`Verify`} variant="filled" w="100%" />
            <FormErrorMessage ta="center" />
            <Box ta="center">
              <AuthButton
                onClick={() => {
                  setFieldValue("useRecoveryCode", !useRecoveryCode);
                  setFieldValue("code", "");
                  setFieldTouched("code", false);
                }}
              >
                {useRecoveryCode
                  ? t`Use an authenticator code instead`
                  : t`Use a recovery code instead`}
              </AuthButton>
            </Box>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

function EmailOtpForm({ mfaToken }: Pick<MfaChallengeFormProps, "mfaToken">) {
  const [sendEmailOtp, { isSuccess: emailSent }] = useSendEmailOtpMutation();

  const handleSubmit = async () => {
    await sendEmailOtp({ mfa_token: mfaToken }).unwrap();
  };

  if (emailSent) {
    return (
      <Text c="text-secondary" ta="center">
        {t`Code sent — check your email`}
      </Text>
    );
  }

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      {({ isSubmitting, submitForm }) => (
        <Form>
          <Stack gap="md" ta="center">
            <AuthButton onClick={() => !isSubmitting && submitForm()}>
              {t`Email me a code`}
            </AuthButton>
            <FormErrorMessage ta="center" />
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

export function MfaChallengeForm({
  mfaToken,
  methods,
  remember,
  onCancel,
}: MfaChallengeFormProps) {
  return (
    <Stack mt="2.5rem" gap="md">
      <ChallengeCodeForm mfaToken={mfaToken} remember={remember} />
      {methods?.includes("email") && <EmailOtpForm mfaToken={mfaToken} />}
      <Box ta="center">
        <AuthButton onClick={onCancel}>{t`Back to log in`}</AuthButton>
      </Box>
    </Stack>
  );
}
