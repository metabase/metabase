import { t } from "ttag";

import { EmbeddingSettingsPageView } from "../EmbeddingSettingsPageView";
import { EmbeddingSettingsSwitch } from "../EmbeddingSettingsSwitch";

import { ManageEmbeds } from "./ManageEmbeds";
import { ManageSecretKey } from "./ManageSecretKey";

export function StaticEmbeddingSettings() {
  return (
    <EmbeddingSettingsPageView
      breadcrumbs={[
        [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
        [t`Static embedding`],
      ]}
    >
      <EmbeddingSettingsSwitch
        settingKey="enable-embedding-static"
        switchLabel={t`Enable Static embedding`}
      />
      <ManageSecretKey />
      <ManageEmbeds />
    </EmbeddingSettingsPageView>
  );
}
