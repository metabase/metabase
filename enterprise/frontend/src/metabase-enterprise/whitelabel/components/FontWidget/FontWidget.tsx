import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import {
  BasicAdminSettingInput,
  SetByEnvVar,
} from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { Box } from "metabase/ui";

import { FontFilesWidget } from "./FontFilesWidget";
import { useGetFontOptions } from "./utils";

const defaultFont = "Lato";

export const FontWidget = () => {
  const fontOptions = useGetFontOptions();
  const {
    value: font,
    updateSetting,
    settingDetails,
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
      value: newValue === "custom" ? defaultFont : newValue,
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
      {settingDetails?.is_env_setting ? (
        <SetByEnvVar varName={settingDetails?.env_name ?? ""} />
      ) : (
        <>
          <BasicAdminSettingInput
            value={fontValue}
            name="application-font"
            inputType="select"
            onChange={(newValue) => handleChange(newValue as string)}
            options={fontOptions}
          />
          {fontValue === "custom" && <FontFilesWidget />}
        </>
      )}
    </Box>
  );
};
