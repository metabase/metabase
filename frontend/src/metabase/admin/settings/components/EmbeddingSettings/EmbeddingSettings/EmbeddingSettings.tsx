import { t } from "ttag";

import { NewEmbedButton } from "metabase/admin/settings/components/EmbeddingSettings/NewEmbedButton/NewEmbedButton";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { Text } from "metabase/ui";

import { EmbeddingSdkSettings } from "../EmbeddingSdkSettings/EmbeddingSdkSettings";
import { EmbeddingSettingsCard } from "../EmbeddingSettingsCard";

/**
 * The embedding-method toggles, without a page wrapper, so the embedding hub's
 * Security tab composes them under its own title.
 *
 * They ship unmerged. Merging modular, SDK and guest into one switch is the
 * design, but it carries two unanswered questions -- what a merged switch reads
 * on an instance already in a mixed state, and which of two consent moments
 * survives -- and neither is a property of relocating the settings.
 *
 * Renders nothing without `embedding_simple`: below that paywall the guest
 * toggle in SharedCombinedEmbeddingSettings is the only embedding method.
 */
export function EmbeddingMethodSettings() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  // The quickstart is part of the documentation page, unlike the SDK, so we only need a single docs link.
  const embedJsDocumentationUrl = useDocsUrl("embedding/embedded-analytics-js");

  if (!hasSimpleEmbedding) {
    return null;
  }

  return (
    <>
      <Text size="lg" fw="bold" lh="xs">
        {t`Embedding methods`}
      </Text>

      <EmbeddingSettingsCard
        title={t`Enable modular embedding`}
        description={t`The simplest way to embed Metabase. Embed dashboards, questions, the query builder, natural language querying with AI, and more in your app with components. Built on the SDK with per-component controls and theming.`}
        settingKey="enable-embedding-simple"
        links={[
          {
            icon: "reference",
            title: t`Documentation`,
            href: embedJsDocumentationUrl?.url,
          },
        ]}
        actionButton={<NewEmbedButton />}
        testId="sdk-setting-card"
      />

      <EmbeddingSdkSettings />

      {PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingSettingsCard && (
        <PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingSettingsCard />
      )}
    </>
  );
}
