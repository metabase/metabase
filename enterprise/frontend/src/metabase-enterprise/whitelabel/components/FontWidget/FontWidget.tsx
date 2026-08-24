import { t } from "ttag";

import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useAdminSetting } from "metabase/settings";
import { BasicAdminSettingInput } from "metabase/settings-components/AdminSettingInput";
import { SettingHeader } from "metabase/settings-components/SettingHeader";
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
            searchable
            // Unjustified type cast. FIXME
            onChange={(newValue) => handleChange(newValue as string)}
            options={fontOptions}
          />
          {fontValue === "custom" && <FontFilesWidget />}
        </>
      )}
    </Box>
  );
};
