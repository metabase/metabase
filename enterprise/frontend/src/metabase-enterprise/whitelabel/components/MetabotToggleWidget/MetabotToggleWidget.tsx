import { t } from "ttag";

import { useAdminSetting } from "metabase/settings";
import { SettingHeader } from "metabase/settings-components/SettingHeader";
import { Box } from "metabase/ui";

import { ImageToggle } from "../ImageToggle";

import { MetabotIcon } from "./MetabotToggleWidget.styled";

export const MetabotToggleWidget = () => {
  const { value, updateSetting } = useAdminSetting("show-metabot");

  return (
    <Box>
      <SettingHeader id="show-metabot" title={t`Metabot greeting`} />

      <ImageToggle
        label={t`Display welcome message on the homepage`}
        value={!!value}
        onChange={() => {
          updateSetting({
            key: "show-metabot",
            value: !value,
          });
        }}
      >
        <MetabotIcon variant={value ? "happy" : "sad"} />
      </ImageToggle>
    </Box>
  );
};
