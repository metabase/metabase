import { t } from "ttag";

import { EmbeddingSettingsCard } from "metabase/admin/settings/components/EmbeddingSettings";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { Stack } from "metabase/ui/components";
import { InteractiveEmbeddingAuthorizedOriginsWidget } from "metabase-enterprise/embedding/components/InteractiveEmbeddingAuthorizedOriginsWidget";

export function InteractiveEmbeddingSettingsCard() {
  const isInteractiveEmbeddingEnabled = useSetting(
    "enable-embedding-interactive",
  );

  const fullAppEmbeddingDocumentationUrl = useDocsUrl(
    "embedding/full-app-embedding",
  );

  return (
    <EmbeddingSettingsCard
      title={t`Enable full app embedding`}
      description={t`Embed the full Metabase application or individual pages into your app. Best for complex, BI-focused scenarios where you want to embed all of Metabase's capabilities into your app. If you are looking for stability of UX, flexibility or control, or don't have a complex use case that requires a full-blown BI solution, we recommend using Modular embedding instead.`}
      settingKey="enable-embedding-interactive"
      links={[
        {
          icon: "reference",
          title: t`Documentation`,
          href: fullAppEmbeddingDocumentationUrl.url,
        },
      ]}
    >
      {isInteractiveEmbeddingEnabled && (
        <Stack gap="xl" px="xl" pb="lg">
          <InteractiveEmbeddingAuthorizedOriginsWidget />
        </Stack>
      )}
    </EmbeddingSettingsCard>
  );
}
