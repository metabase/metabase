import { t } from "ttag";
import { useState } from "react";
import { Radio, Stack } from "metabase/ui";
import type { HelpLinkSetting } from "metabase-types/api";
import InputBlurChange from "metabase/components/InputBlurChange";

interface Props {
  setting: {
    value?: HelpLinkSetting;
    originalValue?: HelpLinkSetting;
    default: HelpLinkSetting;
  };
  onChange: (value: string) => void;
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

export const HelpLinkRadio = ({ setting, onChange }: Props) => {
  const [helpLinkType, setHelpLinkType] = useState(
    getRadioValue(setting.value),
  );
  const [customUrl, setCustomUrl] = useState(
    getRadioValue(setting.value) === "custom" ? setting.value : "",
  );

  const handleRadioChange = (value: string) => {
    setHelpLinkType(value);
    if (["metabase_default", "hidden"].includes(value)) {
      onChange(value);
    }
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
            onChange(e.target.value);
          }}
        />
      )}
    </Stack>
  );
};
