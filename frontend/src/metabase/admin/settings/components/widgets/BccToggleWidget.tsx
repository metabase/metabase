import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Stack } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

import { BasicAdminSettingInput } from "./AdminSettingInput";

const stringValue = (value: boolean): "true" | "false" => `${value}`;

export function BccToggleWidget() {
  const {
    value: initialValue,
    updateSetting,
    description,
    isLoading,
  } = useAdminSetting("bcc-enabled?");

  if (isLoading) {
    return null;
  }

  const handleChange = (newValue: boolean) => {
    if (newValue === initialValue) {
      return;
    }
    updateSetting({ key: "bcc-enabled?", value: newValue });
  };

  return (
    <Stack data-testid="bcc-enabled?-setting">
      <SettingHeader
        id="bcc-enabled?"
        title={t`Add Recipients as CC or BCC`}
        description={description}
      />
      <BasicAdminSettingInput
        name="bcc-enabled?"
        inputType="radio"
        value={stringValue(Boolean(initialValue))}
        onChange={(newValue) => handleChange(newValue === "true")}
        options={[
          { value: "true", label: t`BCC - Hide recipients` },
          {
            value: "false",
            label: t`CC - Disclose recipients`,
          },
        ]}
      />
    </Stack>
  );
}
