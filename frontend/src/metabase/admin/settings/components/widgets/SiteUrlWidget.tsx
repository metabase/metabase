import { useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { InputWithSelectPrefix } from "metabase/common/components/InputWithSelectPrefix";
import { useHasTokenFeature } from "metabase/common/hooks";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { Box, Text } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

import { SetByEnvVarWrapper } from "./AdminSettingInput";

export function SiteUrlWidget() {
  const { value, updateSetting, description, isLoading, settingDetails } =
    useAdminSetting("site-url");
  const isHosted = useHasTokenFeature("hosting");
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (newValue: string) => {
    if (newValue === value) {
      return;
    }
    updateSetting({ key: "site-url", value: newValue }).then((response) => {
      setErrorMessage("");
      if (response?.error) {
        const message =
          (response.error as { data: GenericErrorResponse })?.data?.message ||
          t`Error saving Site URL`;
        setErrorMessage(message);
      }
    });
  };

  if (isHosted || isLoading) {
    return null;
  }

  return (
    <Box data-testid="site-url-setting">
      <SettingHeader
        id="site-url"
        title={t`Site url`}
        description={
          <>
            <strong>{t`Only change this if you know what you're doing!`}</strong>{" "}
            {description}
          </>
        }
      />
      <SetByEnvVarWrapper settingKey="site-url" settingDetails={settingDetails}>
        <InputWithSelectPrefix
          value={value || ""}
          onChange={(newValue: string) => handleChange(newValue)}
          prefixes={["https://", "http://"]}
          defaultPrefix="http://"
          placeholder={"http://example.com"}
        />
        {errorMessage && (
          <Text size="sm" color="danger" mt="sm">
            {errorMessage}
          </Text>
        )}
      </SetByEnvVarWrapper>
    </Box>
  );
}
