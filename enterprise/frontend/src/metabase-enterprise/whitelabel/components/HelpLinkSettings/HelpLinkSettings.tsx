import { t } from "ttag";
import { useState } from "react";
import { Radio, Stack, Text } from "metabase/ui";
import type { HelpLinkSetting, SettingKey, Settings } from "metabase-types/api";
import { SettingInputBlurChange } from "metabase/admin/settings/components/widgets/SettingInput.styled";

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
  ) => Promise<void>;
  settingValues: Settings;
}

const supportedPrefixes = ["http://", "https://", "mailto:"];

export const HelpLinkSettings = ({
  setting,
  onChangeSetting,
  settingValues,
}: Props) => {
  const [helpLinkSetting, setHelpLinkSetting] = useState(
    settingValues["help-link"] || "metabase",
  );

  const [error, setError] = useState<string | null>(null);

  const handleRadioChange = (value: HelpLinkSetting) => {
    setHelpLinkSetting(value);
    onChangeSetting("help-link", value);
  };
  const customUrl = settingValues["help-link-custom-destination"];

  const isTextInputVisible = helpLinkSetting === "custom";

  const handleChange = async (value: string) => {
    if (value === "") {
      setError(t`This field can't be left empty.`);
    } else if (!supportedPrefixes.some(prefix => value.startsWith(prefix))) {
      setError(t`This needs to be an "http://", "https://" or "mailto:" URL.`);
    } else {
      setError("");
      try {
        await onChangeSetting("help-link-custom-destination", value);
      } catch (e: any) {
        setError(e?.data?.message || t`Something went wrong`);
      }
    }
  };

  return (
    <Stack>
      <Radio.Group value={helpLinkSetting} onChange={handleRadioChange}>
        <Stack>
          <Radio label={t`Link to Metabase help`} value="metabase" />
          <Radio label={t`Hide it`} value="hidden" />
          <Radio label={t`Go to a custom destination...`} value="custom" />
        </Stack>
      </Radio.Group>
      {isTextInputVisible && (
        <Stack ml={28} spacing={0}>
          {error && (
            <Text size="md" color="error.0">
              {error}
            </Text>
          )}
          <SettingInputBlurChange
            size="large"
            error={Boolean(error)}
            style={{ marginTop: 4 }}
            value={customUrl}
            // this makes it autofocus only when the value wasn't originally a custom destination
            // this prevents it to be focused on page load
            autoFocus={setting.originalValue !== "custom"}
            onChange={() => setError(null)}
            aria-label={t`Help link custom destination`}
            placeholder={t`Enter a URL it should go to`}
            onBlurChange={e => handleChange(e.target.value)}
          />
        </Stack>
      )}
    </Stack>
  );
};
