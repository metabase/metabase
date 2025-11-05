import cx from "classnames";
import { match } from "ts-pattern";
import { c, jt, t } from "ttag";

import {
  RelatedSettingsSection,
  getModularEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellDevInstances } from "metabase/admin/upsells";
import { UpsellEmbeddingButton } from "metabase/admin/upsells/UpsellEmbeddingButton";
import { UpsellSdkLink } from "metabase/admin/upsells/UpsellSdkLink";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting, useUrlWithUtm } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { isEEBuild } from "metabase/lib/utils";
import {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Box, Button, Group, HoverCard, Icon, Stack, Text } from "metabase/ui";

import { AdminSettingInput } from "../../widgets/AdminSettingInput";
import S from "../EmbeddingSettings.module.css";
import { EmbeddingSettingsCard } from "../EmbeddingSettingsCard";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-sdk",
  utm_content: "embedding-sdk-admin",
};

export function EmbeddingSdkSettings() {
  const dispatch = useDispatch();
  const isEE = isEEBuild();

  const isReactSdkEnabled = useSetting("enable-embedding-sdk");
  const isReactSdkFeatureAvailable = PLUGIN_EMBEDDING_SDK.isEnabled();
  const isLocalhostCorsDisabled = useSetting("disable-cors-on-localhost");

  const isSimpleEmbedEnabled = useSetting("enable-embedding-simple");
  const isSimpleEmbedFeatureAvailable =
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled();

  const isEmbeddingAvailable =
    isReactSdkFeatureAvailable || isSimpleEmbedFeatureAvailable;

  const canEditSdkOrigins =
    (isReactSdkFeatureAvailable && isReactSdkEnabled) ||
    (isSimpleEmbedFeatureAvailable && isSimpleEmbedEnabled);

  const isHosted = useSetting("is-hosted?");

  const { url: switchMetabaseBinariesUrl } = useDocsUrl(
    "paid-features/activating-the-enterprise-edition",
    { utm: utmTags },
  );

  const implementJwtUrl = useDocsUrl("embedding/sdk/authentication", {
    utm: utmTags,
  });

  const sdkQuickStartUrl = useUrlWithUtm(
    "https://metaba.se/sdk-quick-start",
    utmTags,
  );

  const sdkDocumentationUrl = useUrlWithUtm(
    "https://metaba.se/sdk-docs",
    utmTags,
  );

  // The quickstart is part of the documentation page, unlike the SDK, so we only need a single docs link.
  const embedJsDocumentationUrl = useDocsUrl("embedding/embedded-analytics-js");

  const SwitchBinariesLink = (
    <ExternalLink
      key="switch-metabase-binaries"
      href={switchMetabaseBinariesUrl}
      className={cx(CS.link, CS.textBold)}
    >
      {t`switch Metabase binaries`}
    </ExternalLink>
  );

  const ImplementJwtLink = (
    <ExternalLink
      key="implement-jwt"
      href={implementJwtUrl.url}
      className={cx(CS.link, CS.textBold)}
    >
      {t`implement JWT or SAML SSO`}
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
        c(
          "{0} is the link to switch binaries. {1} is the link to upsell the SDK. {2} is the link to implement JWT or SAML authentication.",
        )
          .jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${SwitchBinariesLink}, ${(<UpsellSdkLink key="upsell-sdk-link" />)} and ${ImplementJwtLink}.`,
    )
    .with(
      { needsToUpgrade: true },
      () =>
        c(
          "{0} is the link to upsell the SDK. {1} is the link to implement JWT or SAML authentication.",
        )
          .jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${(<UpsellSdkLink key="upsell-sdk-link" />)} and ${ImplementJwtLink}.`,
    )
    .with(
      { needsToImplementJwt: true },
      () =>
        c("{0} is the link to implement JWT or SAML authentication.")
          .jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${ImplementJwtLink}.`,
    )
    .otherwise(() => null);

  const corsHintText = isLocalhostCorsDisabled
    ? t`Separate values with a space. Localhost is not allowed. Changes will take effect within one minute.`
    : t`Separate values with a space. Localhost is automatically included. Changes will take effect within one minute.`;

  return (
    <SettingsPageWrapper title={t`Modular embedding`}>
      <EmbeddingSettingsCard
        title={t`Embedded Analytics JS`}
        description={t`An easy-to-use library that lets you embed Metabase entities like charts, dashboards, or even the query builder into your own application using customizable components.`}
        settingKey="enable-embedding-simple"
        isFeatureEnabled={isSimpleEmbedFeatureAvailable}
        links={[
          {
            icon: "reference",
            title: t`Documentation`,
            href: embedJsDocumentationUrl?.url,
          },
        ]}
        rightSideContent={
          !isSimpleEmbedFeatureAvailable ? (
            <UpsellEmbeddingButton
              url="https://www.metabase.com/product/embedded-analytics"
              campaign="embedded-analytics-js"
              location="embedding-page"
              size="default"
            />
          ) : undefined
        }
        actionButton={
          isSimpleEmbedFeatureAvailable && (
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                dispatch(setOpenModalWithProps({ id: "embed" }));
              }}
            >
              {t`New embed`}
            </Button>
          )
        }
        testId="sdk-setting-card"
      />

      <EmbeddingSettingsCard
        title={t`SDK for React`}
        description={t`Embed the full power of Metabase into your application to build a custom analytics experience and programmatically manage dashboards and data.`}
        settingKey="enable-embedding-sdk"
        links={[
          {
            icon: "bolt",
            title: t`Quick start`,
            href: sdkQuickStartUrl,
          },
          {
            icon: "reference",
            title: t`Documentation`,
            href: sdkDocumentationUrl,
          },
        ]}
        alertInfoText={apiKeyBannerText}
        testId="sdk-setting-card"
      />

      <Box py="lg" px="xl" className={S.SectionCard}>
        <AdminSettingInput
          title={t`Cross-Origin Resource Sharing (CORS)`}
          description={
            <Group align="center" gap="sm">
              <Text c="text-medium" fz="md">
                {isEmbeddingAvailable
                  ? t`Enter the origins for the websites or apps where you want to allow SDK embedding.`
                  : jt`Try out the SDK on localhost. To enable other sites, ${(<UpsellSdkLink key="upsell-sdk-link" />)} and enter the origins for the websites or apps where you want to allow SDK and Embedded Analytics JS.`}
              </Text>

              {isEmbeddingAvailable && (
                <HoverCard position="bottom">
                  <HoverCard.Target>
                    <Icon name="info" c="text-medium" cursor="pointer" />
                  </HoverCard.Target>

                  <HoverCard.Dropdown>
                    <Box p="md" w={270} bg="white">
                      <Text lh="lg" c="text-medium">
                        {corsHintText}
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

      <RelatedSettingsSection
        items={getModularEmbeddingRelatedSettingItems()}
      />

      <UpsellDevInstances location="embedding-page" />
    </SettingsPageWrapper>
  );
}
