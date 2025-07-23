import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { UpsellSdkLink } from "metabase/admin/upsells/UpsellSdkLink";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting, useUrlWithUtm } from "metabase/common/hooks";
import { isEEBuild } from "metabase/lib/utils";
import {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";
import { getLearnUrl } from "metabase/selectors/settings";
import {
  Alert,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Text,
} from "metabase/ui";

import { SettingHeader } from "../../SettingHeader";
import { AdminSettingInput } from "../../widgets/AdminSettingInput";
import { EmbeddingToggle } from "../EmbeddingToggle";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-sdk",
  utm_content: "embedding-sdk-admin",
};

export function EmbeddingSdkSettings() {
  const isEE = isEEBuild();

  const isReactSdkEnabled = useSetting("enable-embedding-sdk");
  const isReactSdkFeatureEnabled = PLUGIN_EMBEDDING_SDK.isEnabled();

  const isSimpleEmbedEnabled = useSetting("enable-embedding-simple");
  const isSimpleEmbedFeatureEnabled =
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled();

  const isEmbeddingAvailable =
    isReactSdkFeatureEnabled || isSimpleEmbedFeatureEnabled;

  const canEditSdkOrigins =
    (isReactSdkFeatureEnabled && isReactSdkEnabled) ||
    (isSimpleEmbedFeatureEnabled && isSimpleEmbedEnabled);

  const isHosted = useSetting("is-hosted?");

  const { url: switchMetabaseBinariesUrl } = useDocsUrl(
    "paid-features/activating-the-enterprise-edition",
    { utm: utmTags },
  );

  const implementJwtUrl = useUrlWithUtm(
    getLearnUrl("metabase-basics/embedding/securing-embeds"),
    utmTags,
  );

  const quickStartUrl = useUrlWithUtm(
    "https://metaba.se/sdk-quick-start",
    utmTags,
  );

  const documentationUrl = useUrlWithUtm("https://metaba.se/sdk-docs", utmTags);

  const SwitchBinariesLink = (
    <ExternalLink
      key="switch-metabase-binaries"
      href={switchMetabaseBinariesUrl}
    >
      {t`switch Metabase binaries`}
    </ExternalLink>
  );

  const ImplementJwtLink = (
    <ExternalLink key="implement-jwt" href={implementJwtUrl}>
      {t`implement JWT SSO`}
    </ExternalLink>
  );

  const apiKeyBannerText = match({
    needsToSwitchBinaries: !isEE,
    needsToUpgrade: !isEmbeddingAvailable,
    needsToImplementJwt: isEmbeddingAvailable,
  })
    .with(
      { needsToSwitchBinaries: true },
      () =>
        jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${SwitchBinariesLink}, ${(<UpsellSdkLink />)} and ${ImplementJwtLink}.`,
    )
    .with(
      { needsToUpgrade: true },
      () =>
        jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${(<UpsellSdkLink />)} and ${ImplementJwtLink}.`,
    )
    .with(
      { needsToImplementJwt: true },
      () =>
        jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${ImplementJwtLink}.`,
    )
    .otherwise(() => null);

  return (
    <SettingsPageWrapper title={t`Embedded Analytics SDK`}>
      <UpsellDevInstances location="embedding-page" />

      <SettingsSection>
        <Box>
          <Group align="flex-start" gap="lg">
            <Flex direction="column" gap="md" style={{ flex: 1 }}>
              <EmbeddingToggle
                label={t`SDK Embedding`}
                settingKey="enable-embedding-sdk"
              />

              {isSimpleEmbedFeatureEnabled && (
                <Group align="center" gap="sm">
                  <EmbeddingToggle
                    label={t`Simple Embedding`}
                    labelPosition="right"
                    settingKey="enable-embedding-simple"
                  />

                  <Badge size="xs" color="blue" variant="outline">
                    {t`Beta`}
                  </Badge>
                </Group>
              )}
            </Flex>

            <Box>
              <SettingHeader
                id="get-started"
                title={
                  isReactSdkFeatureEnabled
                    ? t`Get started`
                    : t`Try Embedded analytics SDK`
                }
                description={
                  isReactSdkFeatureEnabled
                    ? ""
                    : t`Use the SDK with API keys for development.`
                }
              />

              <Button
                variant="outline"
                component={ExternalLink}
                href={quickStartUrl}
              >{t`Check out the Quickstart`}</Button>
            </Box>
          </Group>
        </Box>

        <Alert
          data-testid="sdk-settings-alert-info"
          icon={
            <Icon color="var(--mb-color-text-secondary)" name="info_filled" />
          }
          bg="var(--mb-color-background-info)"
          style={{
            borderColor: "var(--mb-color-border)",
          }}
          variant="outline"
          px="lg"
          py="md"
          maw={620}
        >
          <Text size="sm">{apiKeyBannerText}</Text>
        </Alert>

        <Box>
          <AdminSettingInput
            name="embedding-app-origins-sdk"
            title={t`Authorized Origins`}
            placeholder="https://*.example.com"
            description={
              isEmbeddingAvailable
                ? t`Enter the origins for the websites or apps where you want to allow embedding, separated by a space. These origins apply to both SDK and iframe embedding. Localhost is automatically included. Changes will take effect within one minute.`
                : jt`Try out the SDK on localhost. To enable other sites, ${(<UpsellSdkLink />)} and Enter the origins for the websites or apps where you want to allow SDK embedding.`
            }
            inputType="text"
            disabled={!canEditSdkOrigins}
          />
        </Box>

        {isEmbeddingAvailable && isHosted && (
          <Box>
            <SettingHeader
              id="version-pinning"
              title={t`Version pinning`}
              description={t`Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.`}
            />
            <Button
              size="compact-md"
              variant="outline"
              leftSection={<Icon size={12} name="mail" aria-hidden />}
              component={ExternalLink}
              fz="0.75rem"
              href="mailto:help@metabase.com"
            >{t`Request version pinning`}</Button>
          </Box>
        )}

        <Text data-testid="sdk-documentation">
          {jt`Check out the ${(
            <ExternalLink key="sdk-doc" href={documentationUrl}>
              {t`documentation`}
            </ExternalLink>
          )} for more.`}
        </Text>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
