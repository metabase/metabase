import { t } from "ttag";

import { SwitchWithSetByEnvVar } from "../../widgets/EmbeddingOption/SwitchWithSetByEnvVar";
import { EmbeddingSettingsPageView } from "../EmbeddingSettingsPageView";

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
      <SwitchWithSetByEnvVar
        settingKey="enable-embedding-static"
        label={t`Enable Static embedding`}
      />
      <ManageSecretKey />
      <ManageEmbeds />
    </EmbeddingSettingsPageView>
  );
}
