import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { jt, t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import {
  BasicAdminSettingInput,
  SetByEnvVar,
} from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { getErrorMessage, useAdminSetting } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Stack, TextInput } from "metabase/ui";
import type { HelpLinkSetting } from "metabase-types/api";

const supportedPrefixes = ["http://", "https://", "mailto:"];

export const HelpLinkSettings = () => {
  const [urlValue, setUrlValue] = useState("");
  const {
    value: helpLinkSetting,
    updateSetting,
    settingDetails: helpLinkDetails,
  } = useAdminSetting("help-link");
  const { value: customUrl, settingDetails: customLinkDetails } =
    useAdminSetting("help-link-custom-destination");
  const previousLinkSetting = usePrevious(helpLinkSetting);

  const [error, setError] = useState<string | null>(null);

  const handleRadioChange = (newValue: HelpLinkSetting) => {
    updateSetting({
      key: "help-link",
      value: newValue,
      toast: newValue !== "custom",
    });
  };

  const handleUrlChange = async (newValue: string) => {
    if (newValue === customUrl) {
      return;
    }

    if (newValue === "") {
      setError(t`This field can't be left empty.`);
    } else if (
      !supportedPrefixes.some((prefix) => newValue.startsWith(prefix))
    ) {
      setError(t`This needs to be an "http://", "https://" or "mailto:" URL.`);
    } else {
      setError("");

      const response = await updateSetting({
        key: "help-link-custom-destination",
        value: newValue,
      });

      if (response.error) {
        const msg = getErrorMessage(
          response.error,
          t`Error saving help link setting`,
        );
        setError(msg);
      }
    }
  };

  useEffect(() => {
    setUrlValue(customUrl || "");
  }, [customUrl]);

  const isTextInputVisible = helpLinkSetting === "custom";

  return (
    <Stack data-testid="help-link-setting">
      <SettingHeader
        id="help-link"
        title={t`Help link`}
        description={jt`Choose a target to the Help link in the Settings menu. It links to ${(
          <ExternalLink
            key="this-page"
            href="https://www.metabase.com/help"
          >{t`this page`}</ExternalLink>
        )} by default.`}
      />
      {helpLinkDetails?.is_env_setting && helpLinkDetails?.env_name ? (
        <SetByEnvVar varName={helpLinkDetails.env_name} />
      ) : (
        <BasicAdminSettingInput
          name="help-link"
          inputType="radio"
          value={helpLinkSetting}
          options={[
            { label: t`Link to Metabase help`, value: "metabase" },
            { label: t`Hide it`, value: "hidden" },
            { label: t`Go to a custom destination...`, value: "custom" },
          ]}
          onChange={(newValue) =>
            handleRadioChange(newValue as HelpLinkSetting)
          }
        />
      )}
      {isTextInputVisible &&
        (customLinkDetails?.is_env_setting && customLinkDetails?.env_name ? (
          <SetByEnvVar varName={customLinkDetails.env_name} />
        ) : (
          <TextInput
            value={urlValue}
            placeholder={t`Enter a URL it should go to`}
            onChange={(e) => setUrlValue(e.target.value)}
            onBlur={() => handleUrlChange(urlValue)}
            // don't autofocus on page load
            autoFocus={previousLinkSetting && helpLinkSetting === "custom"}
            error={error}
          />
        ))}
    </Stack>
  );
};
