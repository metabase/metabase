import { t } from "ttag";
import { useState } from "react";
import { Radio, Stack } from "metabase/ui";
import type { HelpLinkSetting, SettingKey, Settings } from "metabase-types/api";
import InputBlurChange from "metabase/components/InputBlurChange";

interface Props {
  setting: {
    value?: HelpLinkSetting;
    originalValue?: HelpLinkSetting;
    default: HelpLinkSetting;
  };
  onChange: (value: string) => void;
  onChangeSetting: <TKey extends SettingKey>(
    key: TKey,
    value: Settings[TKey],
  ) => void;
  settingValues: Settings;
}

const getRadioValue = (setting: HelpLinkSetting | undefined | null) => {
  switch (setting) {
    case "metabase_default":
    case null:
    case undefined:
      return "metabase_default";
    case "hidden":
      return "hidden";
    default:
      return "custom";
  }
};

export const HelpLinkRadio = ({
  setting,
  onChangeSetting,
  settingValues,
  ...props
}: Props) => {
  const [helpLinkType, setHelpLinkType] = useState(
    settingValues["help-link"] || "metabase_default",
  );
  const [customUrl, setCustomUrl] = useState(
    settingValues["help-link-custom-destination"],
  );

  const handleRadioChange = (value: HelpLinkSetting) => {
    setHelpLinkType(value);
    onChangeSetting("help-link", value);
  };

  const isTextInputVisible = helpLinkType === "custom";

  return (
    <Stack>
      <Radio.Group value={helpLinkType} onChange={handleRadioChange}>
        <Stack>
          <Radio label={t`Link to Metabase help`} value="metabase_default" />
          <Radio label={t`Hide it`} value="hidden" />
          <Radio label={t`Go to a custom destination...`} value="custom" />
        </Stack>
      </Radio.Group>
      {isTextInputVisible && (
        <InputBlurChange
          value={customUrl}
          // this makes it autofocus only when the value wasn't originally a custom destination
          // this prevents it to be focused on page load
          autoFocus={getRadioValue(setting.originalValue) !== "custom"}
          aria-label={t`Help link custom destination`}
          placeholder={t`Enter a URL`}
          onBlurChange={e => {
            setCustomUrl(e.target.value);
            onChangeSetting("help-link-custom-destination", e.target.value);
          }}
        />
      )}
    </Stack>
  );
};
