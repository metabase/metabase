import type { ChangeEvent } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api";
import { useHasTokenFeature, useToast } from "metabase/common/hooks";
import InputWithSelectPrefix from "metabase/components/InputWithSelectPrefix";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { Box } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

export function SiteUrlWidget() {
  const { value, updateSetting } = useAdminSetting("site-url");
  const isHosted = useHasTokenFeature("hosting");
  const [sendToast] = useToast();

  const handleChange = (newValue: string) => {
    if (newValue === value) {
      return;
    }
    updateSetting({ key: "site-url", value: newValue }).then(response => {
      if (response?.error) {
        const message =
          (response.error as GenericErrorResponse)?.message ||
          t`Error saving ${t`Site URL`}`;
        sendToast({ message, icon: "warning", toastColor: "danger" });
      } else {
        sendToast({ message: t`Changes saved`, icon: "check" });
      }
    });
  };

  if (isHosted) {
    return null;
  }

  return (
    <Box>
      <SettingHeader
        id="site-url"
        title={t`Site Url`}
        description={
          <>
            <strong>{t`Only change this if you know what you're doing!`}</strong>{" "}
            {t`This URL is used for things like creating links in emails, auth redirects, and in some embedding scenarios, so changing it could break functionality or get you locked out of this instance.`}
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
    </Box>
  );
}
