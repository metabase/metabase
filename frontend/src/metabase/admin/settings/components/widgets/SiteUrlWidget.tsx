import type { ChangeEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import InputWithSelectPrefix from "metabase/components/InputWithSelectPrefix";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { Box, Text } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

export function SiteUrlWidget() {
  const { value, updateSetting, description } = useAdminSetting("site-url");
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

  if (isHosted) {
    return null;
  }

  return (
    <Box data-testid="site-url-setting">
      <SettingHeader
        id="site-url"
        title={t`Site Url`}
        description={
          <>
            <strong>{t`Only change this if you know what you're doing!`}</strong>{" "}
            {description}
          </>
        }
      />
      <InputWithSelectPrefix
        id="site-url"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          handleChange(e.target.value)
        }
        prefixes={["https://", "http://"]}
        defaultPrefix="http://"
        caseInsensitivePrefix={true}
        placeholder={"http://example.com"}
      />
      {errorMessage && (
        <Text size="sm" color="danger" mt="sm">
          {errorMessage}
        </Text>
      )}
    </Box>
  );
}
