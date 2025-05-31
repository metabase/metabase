import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { Box, Stack } from "metabase/ui";

import { SettingTitle } from "../SettingHeader";
import { SwitchWithSetByEnvVar } from "../widgets/EmbeddingOption/SwitchWithSetByEnvVar";
import { EmbeddedResources } from "../widgets/PublicLinksListing/EmbeddedResources";

import { EmbeddingSecretKeyWidget } from "./EmbeddingSecretKeyWidget";

export function StaticEmbeddingSettings() {
  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");

  return (
    <Box p="0.5rem 1rem 0">
      <Stack gap="2.5rem">
        <Breadcrumbs
          size="large"
          crumbs={[
            [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
            [t`Static embedding`],
          ]}
        />
        <SwitchWithSetByEnvVar
          settingKey="enable-embedding-static"
          label={t`Enable Static embedding`}
        />
        <EmbeddingSecretKeyWidget />

        {isStaticEmbeddingEnabled && (
          <Box data-testid="embedded-resources">
            <SettingTitle id="static-embeds">{t`Manage embeds`}</SettingTitle>
            <EmbeddedResources />
          </Box>
        )}
      </Stack>
    </Box>
  );
}
