import { t } from "ttag";

import { useEmbeddingSetting } from "metabase/admin/settings/components/EmbeddingSettings/hooks";
import SettingHeader from "metabase/admin/settings/components/SettingHeader";
import { SetByEnvVarWrapper } from "metabase/admin/settings/components/SettingsSetting";
import { SettingTextInput } from "metabase/admin/settings/components/widgets/SettingTextInput";
import { Box } from "metabase/ui";

import { EmbeddingAppOriginDescription } from "../EmbeddingAppOriginDescription";

const INTERACTIVE_EMBEDDING_ORIGINS_SETTING = {
  key: "embedding-app-origins-interactive",
  display_name: t`Authorized origins`,
  description: <EmbeddingAppOriginDescription />,
  placeholder: "https://*.example.com",
} as const;

export const AuthorizedOrigins = () => {
  const [originsSetting, handleOriginsChange] = useEmbeddingSetting(
    INTERACTIVE_EMBEDDING_ORIGINS_SETTING,
  );

  return (
    <Box>
      <SetByEnvVarWrapper setting={originsSetting}>
        <SettingHeader id={originsSetting.key} setting={originsSetting} />
        <SettingTextInput
          id={originsSetting.key}
          setting={originsSetting}
          onChange={handleOriginsChange}
          type="text"
        />
      </SetByEnvVarWrapper>
    </Box>
  );
};
