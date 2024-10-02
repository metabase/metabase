import { t } from "ttag";

import SettingHeader from "metabase/admin/settings/components/SettingHeader";
import { SetByEnvVarWrapper } from "metabase/admin/settings/components/SettingsSetting";
import { useGetSetSetting } from "metabase/common/hooks";
import { Box } from "metabase/ui";

import {
  EmbeddingAppSameSiteCookieDescription,
  SameSiteSelectWidget,
} from "../EmbeddingAppSameSiteCookieDescription";

const SAME_SITE_SETTING = {
  key: "session-cookie-samesite",
  display_name: t`SameSite cookie setting`,
  description: <EmbeddingAppSameSiteCookieDescription />,
  widget: SameSiteSelectWidget,
} as const;

export const SameSiteCookieSetting = () => {
  const [sameSiteSetting, handleChangeSameSite] =
    useGetSetSetting(SAME_SITE_SETTING);

  return (
    <Box>
      <SetByEnvVarWrapper setting={sameSiteSetting}>
        <SettingHeader id={sameSiteSetting.key} setting={sameSiteSetting} />
        <SameSiteSelectWidget
          setting={sameSiteSetting}
          onChange={handleChangeSameSite}
        />
      </SetByEnvVarWrapper>
    </Box>
  );
};
