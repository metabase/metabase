import { useState } from "react";
import { t } from "ttag";

import { SetupApi } from "metabase/services";
import { Box, Button, Text, TextInput } from "metabase/ui";

type LicenseTokenFormProps = {
  onValidSubmit: (token: string) => void;
};

export const LicenseTokenForm = ({ onValidSubmit }: LicenseTokenFormProps) => {
  const [token, setToken] = useState("");
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
          placeholder={t`Paste your token here`}
          value={token}
          onChange={e => setToken(e.target.value)}
          error={status === "error"}
        />
        {status === "error" && (
          <Text color="error">{t`This token doesn’t seem to be valid. Double-check it, then contact support if you think it should be working`}</Text>
        )}
      </Box>
      <Button
        variant={isInputCorrectLength ? "filled" : "default"}
        loading={status === "loading"}
        onClick={submit}
      >{t`Activate`}</Button>
    </>
  );
};
