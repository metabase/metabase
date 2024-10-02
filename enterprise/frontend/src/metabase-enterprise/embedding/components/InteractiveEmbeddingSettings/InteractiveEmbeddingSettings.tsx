import { t } from "ttag";

import { EmbeddingSettingsPageView } from "metabase/admin/settings/components/EmbeddingSettings";
import { SwitchWithSetByEnvVar } from "metabase/admin/settings/components/widgets/EmbeddingOption/SwitchWithSetByEnvVar";

import { AuthorizedOrigins } from "./AuthorizedOrigins";
import { SameSiteCookieSetting } from "./SameSiteCookieSetting";

export const InteractiveEmbeddingSettings = () => (
  <EmbeddingSettingsPageView
    breadcrumbs={[
      [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
      [t`Interactive embedding`],
    ]}
  >
    <SwitchWithSetByEnvVar
      settingKey="enable-embedding-interactive"
      label={t`Enable Interactive embedding`}
    />
    <AuthorizedOrigins />
    <SameSiteCookieSetting />
  </EmbeddingSettingsPageView>
);
