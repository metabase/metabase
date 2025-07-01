import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellDevInstances } from "metabase/admin/upsells";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting, useUrlWithUtm } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { getLearnUrl, getUpgradeUrl } from "metabase/selectors/settings";
import { Alert, Box, Button, Icon, Text } from "metabase/ui";

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
  const isEE = PLUGIN_EMBEDDING_SDK.isEnabled();
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");

  const canEditSdkOrigins = isEE && isEmbeddingSdkEnabled;

  const isHosted = useSetting("is-hosted?");

  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, {
      utm_campaign: "embedding-sdk",
      utm_content: "embedding-sdk-admin",
    }),
  );

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

  const apiKeyBannerText = match({
    isOSS: !isEE && !isHosted,
    isCloudStarter: !isEE && isHosted,
    isEE,
  })
    .with(
      { isOSS: true },
      () =>
        jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${(
          <ExternalLink
            key="switch-metabase-binaries"
            href={switchMetabaseBinariesUrl}
          >
            {t`switch Metabase binaries`}
          </ExternalLink>
        )}, ${(
          <ExternalLink key="upgrade-url" href={upgradeUrl}>
            {t`upgrade to Metabase Pro`}
          </ExternalLink>
        )} and ${(
          <ExternalLink key="implement-jwt" href={implementJwtUrl}>
            {t`implement JWT SSO`}
          </ExternalLink>
        )}.`,
    )
    .with(
      { isCloudStarter: true },
      () =>
        jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${(
          <ExternalLink key="upgrade-url" href={upgradeUrl}>
            {t`upgrade to Metabase Pro`}
          </ExternalLink>
        )} and ${(
          <ExternalLink key="implement-jwt" href={implementJwtUrl}>
            {t`implement JWT SSO`}
          </ExternalLink>
        )}.`,
    )
    .with(
      { isEE: true },
      () =>
        jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${(
          <ExternalLink key="implement-jwt" href={implementJwtUrl}>
            {t`implement JWT SSO`}
          </ExternalLink>
        )}.`,
    )
    .otherwise(() => null);

  return (
    <SettingsPageWrapper title={t`Embedding SDK`}>
      <UpsellDevInstances source="embedding-page" />
      <SettingsSection>
        <EmbeddingToggle
          label={t`Enable Embedded analytics SDK for React`}
          settingKey="enable-embedding-sdk"
        />

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
          <SettingHeader
            id="get-started"
            title={isEE ? t`Get started` : t`Try Embedded analytics SDK`}
            description={
              isEE ? "" : t`Use the SDK with API keys for development.`
            }
          />
          <Button
            variant="outline"
            component={ExternalLink}
            href={quickStartUrl}
          >{t`Check out the Quickstart`}</Button>
        </Box>
        <Box>
          <AdminSettingInput
            name="embedding-app-origins-sdk"
            title={t`Cross-Origin Resource Sharing (CORS)`}
            placeholder="https://*.example.com"
            description={
              isEE
                ? t`Enter the origins for the websites or apps where you want to allow SDK embedding, separated by a space. Localhost is automatically included. Changes will take effect within one minute.`
                : jt`Try out the SDK on localhost. To enable other sites, ${(
                    <ExternalLink key="upgrade-url" href={upgradeUrl}>
                      {t`upgrade to Metabase Pro`}
                    </ExternalLink>
                  )} and Enter the origins for the websites or apps where you want to allow SDK embedding.`
            }
            inputType="text"
            disabled={!canEditSdkOrigins}
          />
        </Box>
        {isEE && isHosted && (
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
