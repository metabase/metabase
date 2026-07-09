import { type FormEvent, useState } from "react";
import { t } from "ttag";

import type { MfaChallengeFormProps } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { openNavbar } from "metabase/redux/app";
import { refreshSession } from "metabase/redux/auth";
import { Box, Button, Stack, Text, TextInput } from "metabase/ui";
import { isSmallScreen } from "metabase/utils/dom";
import {
  useSendEmailOtpMutation,
  useVerifyMfaMutation,
} from "metabase-enterprise/api";

const TOTP_CODE_LENGTH = 6;

export const MfaChallengeForm = ({
  mfaToken,
  methods,
}: MfaChallengeFormProps) => {
  const dispatch = useDispatch();
  const [verifyMfa] = useVerifyMfaMutation();
  const [sendEmailOtp] = useSendEmailOtpMutation();
  const [emailSent, setEmailSent] = useState(false);
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useRecoveryCode
    ? code.length > 0
    : code.length === TOTP_CODE_LENGTH;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await verifyMfa({ mfa_token: mfaToken, code: code.trim() }).unwrap();
      // The session cookie is now set; refresh and let the route guard redirect.
      await dispatch(refreshSession()).unwrap();
      if (!isSmallScreen()) {
        dispatch(openNavbar());
      }
    } catch {
      setError(t`That code didn't work. Please try again.`);
      setIsSubmitting(false);
    }
  };

  return (
    <Box component="form" mt="2.5rem" onSubmit={handleSubmit}>
      <Stack gap="md">
        <Text c="text-secondary" ta="center">
          {useRecoveryCode
            ? t`Enter one of your recovery codes.`
            : t`Enter the 6-digit code from your authenticator app.`}
        </Text>
        <TextInput
          value={code}
          onChange={(event) =>
            setCode(
              useRecoveryCode
                ? event.currentTarget.value
                : event.currentTarget.value.replace(/\D/g, ""),
            )
          }
          placeholder={useRecoveryCode ? "xxxxx-xxxxx" : "123456"}
          maxLength={useRecoveryCode ? 11 : TOTP_CODE_LENGTH}
          inputMode={useRecoveryCode ? "text" : "numeric"}
          autoFocus
          error={error}
        />
        <Button
          type="submit"
          variant="filled"
          fullWidth
          loading={isSubmitting}
          disabled={!canSubmit}
        >
          {t`Verify`}
        </Button>
        <Button
          variant="subtle"
          onClick={() => {
            setUseRecoveryCode(!useRecoveryCode);
            setCode("");
            setError(null);
          }}
        >
          {useRecoveryCode
            ? t`Use an authenticator code instead`
            : t`Use a recovery code instead`}
        </Button>
        {methods?.includes("email") && (
          <Button
            variant="subtle"
            disabled={emailSent}
            onClick={async () => {
              try {
                await sendEmailOtp({ mfa_token: mfaToken }).unwrap();
                setEmailSent(true);
              } catch {
                setError(t`Couldn't send the email. Try again in a minute.`);
              }
            }}
          >
            {emailSent ? t`Code sent — check your email` : t`Email me a code`}
          </Button>
        )}
      </Stack>
    </Box>
  );
};
