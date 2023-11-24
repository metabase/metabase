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
  const [radioValue, setRadioValue] = useState(getRadioValue(setting.value));
  const [textValue, setTextValue] = useState(
    getRadioValue(setting.value) === "custom" ? setting.value : "",
  );

  const handleChange = (value: string) => {
    setRadioValue(value);
    switch (value) {
      case "metabase_default":
      case "hidden":
        onChange(value);
        break;
      case "custom":
      // we don't emit it here, it's the input text that emits the full url
    }
  };
  const radioVisible = radioValue === "custom";
  return (
    <Stack>
      <Radio.Group value={radioValue} onChange={handleChange}>
        <Stack>
          <Radio label={t`Link to Metabase help`} value={"metabase_default"} />
          <Radio label={t`Hide it`} value={"hidden"} />
          <Radio label={t`Go to a custom destination...`} value={"custom"} />
        </Stack>
      </Radio.Group>
      {radioVisible && (
        <InputBlurChange
          value={textValue}
          // this makes it autofocus only when the value wasn't originally a custom destination
          // this prevents it to be focused on page load
          autoFocus={getRadioValue(setting.originalValue) !== "custom"}
          style={{ display: radioVisible ? "block" : "none" }}
          aria-label={t`Help link custom destination`}
          placeholder={t`Enter a URL`}
          onBlurChange={e => {
            setTextValue(e.target.value);
            onChange(e.target.value);
          }}
        />
      )}
    </Stack>
  );
};
