import { t } from "ttag";

import type { AdminSettingComponentProps } from "metabase/admin/settings/components/EmbeddingSettings/types";
import SettingHeader from "metabase/admin/settings/components/SettingHeader";
import { SetByEnvVarWrapper } from "metabase/admin/settings/components/SettingsSetting";
import { SwitchWithSetByEnvVar } from "metabase/admin/settings/components/widgets/EmbeddingOption/SwitchWithSetByEnvVar";
import { SettingTextInput } from "metabase/admin/settings/components/widgets/SettingTextInput";
import { useMergeSetting } from "metabase/common/hooks";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { Box, Stack } from "metabase/ui";
import type { SessionCookieSameSite } from "metabase-types/api";

import { EmbeddingAppOriginDescription } from "./EmbeddingAppOriginDescription";
import {
  EmbeddingAppSameSiteCookieDescription,
  SameSiteSelectWidget,
} from "./EmbeddingAppSameSiteCookieDescription";

const INTERACTIVE_EMBEDDING_ORIGINS_SETTING = {
  key: "embedding-app-origins-interactive",
  display_name: t`Authorized origins`,
  description: <EmbeddingAppOriginDescription />,
  placeholder: "https://*.example.com",
} as const;

const SAME_SITE_SETTING = {
  key: "session-cookie-samesite",
  display_name: t`SameSite cookie setting`,
  description: <EmbeddingAppSameSiteCookieDescription />,
  widget: SameSiteSelectWidget,
} as const;

export function InteractiveEmbeddingSettings({
  updateSetting,
}: AdminSettingComponentProps) {
  function handleToggleInteractiveEmbedding(value: boolean) {
    updateSetting({ key: "enable-embedding-interactive" }, value);
  }

  const interactiveEmbeddingOriginsSetting = useMergeSetting(
    INTERACTIVE_EMBEDDING_ORIGINS_SETTING,
  );

  function handleChangeInteractiveEmbeddingOrigins(value: string | null) {
    updateSetting({ key: interactiveEmbeddingOriginsSetting.key }, value);
  }

  const sameSiteSetting = useMergeSetting(SAME_SITE_SETTING);

  function handleChangeSameSite(value: SessionCookieSameSite) {
    updateSetting({ key: sameSiteSetting.key }, value);
  }

  return (
    <Box p="0.5rem 1rem 0">
      <Stack spacing="2.5rem">
        <Breadcrumbs
          size="large"
          crumbs={[
            [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
            [t`Interactive embedding`],
          ]}
        />
        <SwitchWithSetByEnvVar
          settingKey="enable-embedding-interactive"
          onChange={handleToggleInteractiveEmbedding}
          label={t`Enable Interactive embedding`}
        />
        <Box>
          <SettingHeader
            id={interactiveEmbeddingOriginsSetting.key}
            setting={interactiveEmbeddingOriginsSetting}
          />
          <SetByEnvVarWrapper setting={interactiveEmbeddingOriginsSetting}>
            <SettingTextInput
              id={interactiveEmbeddingOriginsSetting.key}
              setting={interactiveEmbeddingOriginsSetting}
              onChange={handleChangeInteractiveEmbeddingOrigins}
              type="text"
            />
          </SetByEnvVarWrapper>
        </Box>
        <Box>
          <SettingHeader id={sameSiteSetting.key} setting={sameSiteSetting} />
          <SetByEnvVarWrapper setting={sameSiteSetting}>
            <SameSiteSelectWidget
              setting={sameSiteSetting}
              onChange={handleChangeSameSite}
            />
          </SetByEnvVarWrapper>
        </Box>
      </Stack>
    </Box>
  );
}
