import cx from "classnames";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { UpsellSdkLink } from "metabase/admin/upsells/UpsellSdkLink";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting, useUrlWithUtm } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
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
  HoverCard,
  Icon,
  Text,
} from "metabase/ui";

import { SettingHeader } from "../../SettingHeader";
import { AdminSettingInput } from "../../widgets/AdminSettingInput";
import { EmbeddingToggle } from "../EmbeddingToggle";

import S from "./EmbeddingSdkSettings.module.css";

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
    <ExternalLink
      key="implement-jwt"
      href={implementJwtUrl}
      className={cx(CS.link, CS.textBold)}
    >
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
    <SettingsPageWrapper title={t`Modular embedding`}>
      <UpsellDevInstances location="embedding-page" />

      <Flex direction="column" p="xl" className={S.SectionCard} gap="md">
        <Group>
          <Text size="lg" fw={600} c="text-dark">
            {t`SDK for React`}
          </Text>
        </Group>

        <Group gap="sm" align="center" justify="space-between" w="100%">
          <EmbeddingToggle
            label={t`Enabled`}
            settingKey="enable-embedding-sdk"
            labelPosition="right"
          />

          <Group gap="md">
            <Button
              size="compact-xs"
              variant="outline"
              component={ExternalLink}
              href={quickStartUrl}
              rightSection={<Icon size={12} name="external" />}
              fz="sm"
            >
              {t`Quick start`}
            </Button>

            <Button
              size="compact-xs"
              variant="outline"
              component={ExternalLink}
              href={documentationUrl}
              rightSection={<Icon size={12} name="external" />}
              fz="sm"
            >
              {t`Documentation`}
            </Button>
          </Group>
        </Group>
      </Flex>

      {isSimpleEmbedFeatureEnabled && (
        <Box p="xl" className={S.SectionCard}>
          <Flex direction="column" gap="md">
            <Group gap="sm">
              <Text size="lg" fw={600} c="text-dark">
                {t`Embedded Analytics JS`}
              </Text>

              <Badge size="sm">{t`Beta`}</Badge>
            </Group>

            <Group gap="sm" align="center" justify="space-between" w="100%">
              <EmbeddingToggle
                label={t`Enabled`}
                labelPosition="right"
                settingKey="enable-embedding-simple"
              />

              <Group gap="md">
                <Button
                  size="compact-xs"
                  variant="outline"
                  component={ExternalLink}
                  href={quickStartUrl}
                  rightSection={<Icon size={12} name="external" />}
                  fz="sm"
                >
                  {t`Quick start`}
                </Button>

                <Button
                  size="compact-xs"
                  variant="outline"
                  component={ExternalLink}
                  href={documentationUrl}
                  rightSection={<Icon size={12} name="external" />}
                  fz="sm"
                >
                  {t`Documentation`}
                </Button>
              </Group>
            </Group>
          </Flex>
        </Box>
      )}

      <Box py="lg" px="xl" className={S.SectionCard}>
        <AdminSettingInput
          title={t`Cross-Origin Resource Sharing (CORS)`}
          description={
            <Group align="center" gap="sm">
              <Text c="text-medium" fz="md">
                {isEmbeddingAvailable
                  ? t`Enter the origins for the websites or apps where you want to allow SDK embedding.`
                  : jt`Try out the SDK on localhost. To enable other sites, ${(<UpsellSdkLink />)} and enter the origins for the websites or apps where you want to allow SDK and Embedded Analytics JS.`}
              </Text>

              {isEmbeddingAvailable && (
                <HoverCard position="bottom">
                  <HoverCard.Target>
                    <Icon name="info_filled" c="text-medium" cursor="pointer" />
                  </HoverCard.Target>

                  <HoverCard.Dropdown>
                    <Box p="md" w={270}>
                      <Text lh="lg" c="text-medium">
                        {t`Separate values with a space. Localhost is automatically included. Changes will take effect within one minute.`}
                      </Text>
                    </Box>
                  </HoverCard.Dropdown>
                </HoverCard>
              )}
            </Group>
          }
          name="embedding-app-origins-sdk"
          placeholder="https://*.example.com"
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

      <Alert
        data-testid="sdk-settings-alert-info"
        px="xl"
        bg="none"
        bd="1px solid var(--mb-color-border)"
      >
        <Group gap="sm">
          <Icon color="var(--mb-color-text-secondary)" name="info_filled" />

          <Text size="sm" c="text-medium" lh="lg">
            {apiKeyBannerText}
          </Text>
        </Group>
      </Alert>
    </SettingsPageWrapper>
  );
}
