import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { completeMfaLogin } from "metabase/redux/auth";
import { Box, Button, Stack, Text, TextInput } from "metabase/ui";

interface MfaChallengeFormProps {
  mfaToken: string;
}

const CODE_LENGTH = 6;

export const MfaChallengeForm = ({ mfaToken }: MfaChallengeFormProps) => {
  const dispatch = useDispatch();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      // On success the user becomes authenticated and the route guard redirects.
      await dispatch(completeMfaLogin({ mfaToken, code })).unwrap();
    } catch {
      setError(t`That code didn't work. Please try again.`);
      setIsSubmitting(false);
    }
  };

  return (
    <Box component="form" mt="2.5rem" onSubmit={handleSubmit}>
      <Stack gap="md">
        <Text c="text-secondary" ta="center">
          {t`Enter the 6-digit code from your authenticator app.`}
        </Text>
        <TextInput
          value={code}
          onChange={(event) =>
            setCode(event.currentTarget.value.replace(/\D/g, ""))
          }
          placeholder="123456"
          maxLength={CODE_LENGTH}
          inputMode="numeric"
          autoFocus
          error={error}
        />
        <Button
          type="submit"
          variant="filled"
          fullWidth
          loading={isSubmitting}
          disabled={code.length !== CODE_LENGTH}
        >
          {t`Verify`}
        </Button>
      </Stack>
    </Box>
  );
};
