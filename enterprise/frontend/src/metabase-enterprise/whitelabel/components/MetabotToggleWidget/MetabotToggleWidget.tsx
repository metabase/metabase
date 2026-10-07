import { t } from "ttag";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { useAdminSetting } from "metabase/settings";
import { SettingHeader } from "metabase/settings-components";
import { Box } from "metabase/ui";

import { ImageToggle } from "../ImageToggle";

import S from "./MetabotToggleWidget.module.css";

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
        <MetabotLogo className={S.icon} variant={value ? "happy" : "sad"} />
      </ImageToggle>
    </Box>
  );
};
