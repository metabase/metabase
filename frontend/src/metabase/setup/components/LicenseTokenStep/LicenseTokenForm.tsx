import { useState } from "react";
import { t } from "ttag";

import { SetupApi } from "metabase/services";
import { Box, Button, Flex, Text, TextInput } from "metabase/ui";

type LicenseTokenFormProps = {
  onValidSubmit: (token: string) => void;
  onSkip: () => void;
  initialValue?: string;
};

export const LicenseTokenForm = ({
  onValidSubmit,
  onSkip,
  initialValue = "",
}: LicenseTokenFormProps) => {
  const [token, setToken] = useState(initialValue);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const isInputCorrectLength = token.length === 64;

  const submit = async () => {
    setStatus("loading");
    try {
      const response = await SetupApi.validate_token({ token });
      if (response.valid) {
        setStatus("success");
        onValidSubmit(token);
      } else {
        setStatus("error");
      }
    } catch (e) {
      setStatus("error");
    }
  };

  return (
    <>
      <Box mb="md">
        <TextInput
          aria-label={t`Token`}
          placeholder={t`Paste your token here`}
          value={token}
          onChange={e => {
            setToken(e.target.value.trim());
            setStatus(oldState =>
              oldState !== "loading" ? "idle" : "loading",
            );
          }}
          error={status === "error"}
        />
        {status === "error" && (
          <Text color="error">{t`This token doesn’t seem to be valid. Double-check it, then contact support if you think it should be working`}</Text>
        )}
      </Box>
      <Flex gap="lg">
        <Button onClick={onSkip}>{t`Skip`}</Button>
        <Button
          disabled={!isInputCorrectLength}
          loading={status === "loading"}
          variant="filled"
          onClick={submit}
        >{t`Activate`}</Button>
      </Flex>
    </>
  );
};
