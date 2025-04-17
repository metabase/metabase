import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { BasicAdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { Box } from "metabase/ui";

import { FontFilesWidget } from "./FontFilesWidget";
import { useGetFontOptions } from "./utils";

export const FontWidget = () => {
  const fontOptions = useGetFontOptions();
  const {
    value: font,
    updateSetting,
    description,
  } = useAdminSetting("application-font");
  const { value: fontFiles } = useAdminSetting("application-font-files");

  const fontValue = fontFiles ? "custom" : font;

  const handleChange = async (newValue: string) => {
    if (newValue === fontValue) {
      return;
    }

    await updateSetting({
      key: "application-font",
      // If the new value is "custom", we set the value to null
      value: newValue === "custom" ? null : newValue,
    });

    await updateSetting({
      key: "application-font-files",
      value: newValue === "custom" ? [] : null,
      toast: false,
    });
  };

  return (
    <Box>
      <SettingHeader
        id="application-font"
        title={t`Font`}
        description={description}
      />
      <BasicAdminSettingInput
        value={fontValue}
        name="application-font"
        inputType="select"
        onChange={(newValue) => handleChange(newValue as string)}
        options={fontOptions}
      />
      {fontValue === "custom" && <FontFilesWidget />}
    </Box>
  );
};
