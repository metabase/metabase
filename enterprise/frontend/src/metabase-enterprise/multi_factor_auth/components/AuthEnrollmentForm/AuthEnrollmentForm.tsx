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
import type { AuthEnrollmentFormProps } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { completeLogin } from "metabase/redux/auth";
import { Box, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useEnrollMfaOnLoginMutation } from "metabase-enterprise/api";

import { TOTP_CODE_LENGTH } from "../../constants";
import { withTotpCodeRules } from "../../schemas";
import { TotpEnrollInstructions } from "../common/TotpEnrollInstructions";

const ENROLL_SCHEMA = Yup.object({
  code: withTotpCodeRules(Yup.string().required(Errors.required)),
});

type EnrollValues = { code: string };

const INITIAL_VALUES: EnrollValues = { code: "" };

/**
 * Forced enrollment during login, shown in place of the password form when the instance requires
 * MFA and this user has no second factor yet.
 *
 * The enroll request also returns recovery codes, which are deliberately not shown here: that same
 * request sets the session cookie, and the EE session middleware polls for it and refreshes the
 * session within a few seconds, redirecting out of `/auth/login`. Anything rendered at this point
 * is on a countdown. Users can generate a set from Account → Security once signed in.
 */
export function AuthEnrollmentForm({
  enrollmentToken,
  secret,
  otpauthUri,
  remember,
  onCancel,
}: AuthEnrollmentFormProps) {
  const dispatch = useDispatch();
  const [enrollMfaOnLogin] = useEnrollMfaOnLoginMutation();

  const handleSubmit = async ({ code }: EnrollValues) => {
    await enrollMfaOnLogin({
      enrollment_token: enrollmentToken,
      code: code.trim(),
      remember,
    }).unwrap();

    await dispatch(completeLogin()).unwrap();
  };

  return (
    <Stack mt="2.5rem" gap="md">
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
    </Stack>
  );
}
