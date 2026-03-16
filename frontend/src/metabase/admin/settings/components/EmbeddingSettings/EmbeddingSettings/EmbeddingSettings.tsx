import type { PropsWithChildren } from "react";
import { t } from "ttag";

import {
  RelatedSettingsSection,
  getModularEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { NewEmbedButton } from "metabase/admin/settings/components/EmbeddingSettings/NewEmbedButton/NewEmbedButton";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  useDocsUrl,
  useHasTokenFeature,
  useSetting,
} from "metabase/common/hooks";
import { isEEBuild } from "metabase/lib/utils";
import {
  PLUGIN_ADMIN_SETTINGS,
  PLUGIN_CONTENT_TRANSLATION,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";
import { Box, Group, Icon, Stack, Text } from "metabase/ui";

import { EmbeddingSdkSettings } from "../EmbeddingSdkSettings/EmbeddingSdkSettings";
import S from "../EmbeddingSettings.module.css";
import { EmbeddingSettingsCard } from "../EmbeddingSettingsCard";
import { SharedCombinedEmbeddingSettings } from "../SharedCombinedEmbeddingSettings";

function EmbeddingSettingsPageWrapper({ children }: PropsWithChildren) {
  const isEE = isEEBuild();
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
  const isReactSdkFeatureAvailable = PLUGIN_EMBEDDING_SDK.isEnabled();

  const isHosted = useSetting("is-hosted?");

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

      <Text size="lg" fw="bold" lh="xs">
        {t`Settings`}
      </Text>

      <PLUGIN_CONTENT_TRANSLATION.ContentTranslationConfiguration />

      {isReactSdkFeatureAvailable && isHosted && (
        <Box py="lg" px="xl" className={S.SectionCard}>
          <Stack gap="xs">
            <Text
              htmlFor="version-pinning"
              component="label"
              c="text-primary"
              fw="bold"
              fz="lg"
            >
              {t`Version pinning`}
            </Text>

            <Text c="text-secondary" lh="lg" mb="sm">
              {t`Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.`}
            </Text>

            <ExternalLink href="mailto:help@metabase.com">
              <Group gap="sm" fw="bold" w="fit-content">
                <Icon name="mail" size={14} aria-hidden />
                <span>{t`Request version pinning`}</span>
              </Group>
            </ExternalLink>
          </Stack>
        </Box>
      )}
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
