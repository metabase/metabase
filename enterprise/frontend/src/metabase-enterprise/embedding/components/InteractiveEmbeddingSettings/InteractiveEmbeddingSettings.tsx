import { t } from "ttag";

import {
  EmbeddingSettingsPageView,
  EmbeddingSettingsSwitch,
} from "metabase/admin/settings/components/EmbeddingSettings";

import { AuthorizedOrigins } from "./AuthorizedOrigins";
import { SameSiteCookieSetting } from "./SameSiteCookieSetting";

export const InteractiveEmbeddingSettings = () => (
  <EmbeddingSettingsPageView
    breadcrumbs={[
      [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
      [t`Interactive embedding`],
    ]}
  >
    <EmbeddingSettingsSwitch
      settingKey={"enable-embedding-interactive"}
      switchLabel={t`Enable Interactive embedding`}
    />
    <AuthorizedOrigins />
    <SameSiteCookieSetting />
  </EmbeddingSettingsPageView>
);
