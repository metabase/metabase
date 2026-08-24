import type { PropsWithChildren } from "react";
import { t } from "ttag";

import {
  RelatedSettingsSection,
  getModularEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { NewEmbedButton } from "metabase/admin/settings/components/EmbeddingSettings/NewEmbedButton/NewEmbedButton";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import {
  PLUGIN_ADMIN_SETTINGS,
  PLUGIN_CONTENT_TRANSLATION,
  PLUGIN_IS_EE_BUILD,
} from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { Text } from "metabase/ui";

import { EmbeddingSdkSettings } from "../EmbeddingSdkSettings/EmbeddingSdkSettings";
import { EmbeddingSettingsCard } from "../EmbeddingSettingsCard";
import { SharedCombinedEmbeddingSettings } from "../SharedCombinedEmbeddingSettings";

function EmbeddingSettingsPageWrapper({ children }: PropsWithChildren) {
  const isEE = PLUGIN_IS_EE_BUILD.isEEBuild();
  const isUsingTenants = useSetting("use-tenants");
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  return (
    <SettingsPageWrapper title={t`Embedding settings`}>
      {children}

      <RelatedSettingsSection
        items={getModularEmbeddingRelatedSettingItems({
          isUsingTenants,
          hasSimpleEmbedding,
        })}
      />

      {isEE && <UpsellDevInstances location="embedding-page" />}
    </SettingsPageWrapper>
  );
}

function EmbeddingSettingsEE() {
  // The quickstart is part of the documentation page, unlike the SDK, so we only need a single docs link.
  const embedJsDocumentationUrl = useDocsUrl("embedding/embedded-analytics-js");

  return (
    <>
      <Text size="lg" fw="bold" lh="xs">
        {t`Embedding methods`}
      </Text>

      <EmbeddingSettingsCard
        title={t`Enable modular embedding`}
        description={t`The simplest way to embed Metabase. Embed dashboards, questions, the query builder, natural language querying with AI, and more in your app with components. Built on the SDK with per-component controls and theming.`}
        settingKey="enable-embedding-modular"
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

      <Text size="lg" fw="bold" lh="xs">
        {t`Settings`}
      </Text>

      <PLUGIN_CONTENT_TRANSLATION.ContentTranslationConfiguration />
    </>
  );
}

function EmbeddingSettingsOSS() {
  return <SharedCombinedEmbeddingSettings showContentTranslationSettings />;
}

export const EmbeddingSettings = () => {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  return (
    <EmbeddingSettingsPageWrapper>
      {hasSimpleEmbedding ? <EmbeddingSettingsEE /> : <EmbeddingSettingsOSS />}
    </EmbeddingSettingsPageWrapper>
  );
};
