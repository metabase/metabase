import { t } from "ttag";
import * as Yup from "yup";

import { AuthTextButton } from "metabase/auth/components/AuthButton";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import type { AuthChallengeFormProps } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { completeLogin } from "metabase/redux/auth";
import { Box, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useSendEmailOtpMutation,
  useVerifyMfaMutation,
} from "metabase-enterprise/api";

import { TOTP_CODE_LENGTH } from "../../constants";
import { withTotpCodeRules } from "../../schemas";

const CHALLENGE_SCHEMA = Yup.object({
  code: Yup.string().required(Errors.required).when("useRecoveryCode", {
    is: false,
    then: withTotpCodeRules,
  }),
  useRecoveryCode: Yup.boolean(),
});

type ChallengeCodeValues = {
  code: string;
  useRecoveryCode: boolean;
};

type ChallengeCodeFormProps = {
  challengeToken: string;
  remember?: boolean;
};

function ChallengeCodeForm({
  challengeToken,
  remember,
}: ChallengeCodeFormProps) {
  const dispatch = useDispatch();
  const [verifyMfa] = useVerifyMfaMutation();

  const handleSubmit = async ({ code }: ChallengeCodeValues) => {
    await verifyMfa({
      challenge_token: challengeToken,
      code: code.trim().toLowerCase(),
      remember,
    }).unwrap();
    await dispatch(completeLogin()).unwrap();
  };

  return (
    <FormProvider<ChallengeCodeValues>
      initialValues={{ code: "", useRecoveryCode: false }}
      validationSchema={CHALLENGE_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({
        values: { useRecoveryCode },
        isSubmitting,
        setFieldValue,
        setFieldTouched,
      }) => (
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
              maxLength={useRecoveryCode ? undefined : TOTP_CODE_LENGTH}
              inputMode={useRecoveryCode ? "text" : "numeric"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
            <FormSubmitButton label={t`Verify`} variant="filled" w="100%" />
            <FormErrorMessage ta="center" />
            <Box ta="center">
              <AuthTextButton
                disabled={isSubmitting}
                onClick={() => {
                  setFieldValue("useRecoveryCode", !useRecoveryCode);
                  setFieldValue("code", "");
                  setFieldTouched("code", false);
                }}
              >
                {useRecoveryCode
                  ? t`Use an authenticator code instead`
                  : t`Use a recovery code instead`}
              </AuthTextButton>
            </Box>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

type EmailOtpFormProps = {
  challengeToken: string;
};

function EmailOtpForm({ challengeToken }: EmailOtpFormProps) {
  const [sendEmailOtp, { isSuccess: emailSent }] = useSendEmailOtpMutation();

  const handleSubmit = async () => {
    await sendEmailOtp({ challenge_token: challengeToken }).unwrap();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      {({ isSubmitting, submitForm }) => (
        <Form>
          <Stack gap="md" ta="center">
            {emailSent && (
              <Text c="text-secondary">{t`Code sent — check your email`}</Text>
            )}
            <AuthTextButton
              disabled={isSubmitting}
              onClick={() => submitForm()}
            >
              {emailSent ? t`Resend code` : t`Email me a code`}
            </AuthTextButton>
            <FormErrorMessage ta="center" />
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

export function AuthChallengeForm({
  challengeToken,
  methods,
  remember,
  onCancel,
}: AuthChallengeFormProps) {
  return (
    <Stack mt="2.5rem" gap="md">
      <ChallengeCodeForm challengeToken={challengeToken} remember={remember} />
      {methods?.includes("email") && (
        <EmailOtpForm challengeToken={challengeToken} />
      )}
      <Box ta="center">
        <AuthTextButton onClick={onCancel}>{t`Back to log in`}</AuthTextButton>
      </Box>
    </Stack>
  );
}
