import type { ChangeEvent } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import {
  getLearnUrl,
  getSetting,
  getUpgradeUrl,
} from "metabase/selectors/settings";
import { Alert, Box, Button, Icon, Stack, Switch, Text } from "metabase/ui";

import SettingHeader from "../SettingHeader";
import { SetByEnvVarWrapper } from "../SettingsSetting";
import { SettingTextInput } from "../widgets/SettingTextInput";

import { useMergeSetting } from "./hooks";
import type { AdminSettingComponentProps } from "./types";

export function EmbeddingSdkSettings({
  updateSetting,
}: AdminSettingComponentProps) {
  const isEE = PLUGIN_EMBEDDING_SDK.isEnabled();
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");
  const canEditSdkOrigins = isEE && isEmbeddingSdkEnabled;

  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  const addUtmToLink = (url: string) =>
    `${url}?${new URLSearchParams({
      utm_source: "product",
      utm_medium: "docs",
      utm_campaign: "embedding-sdk",
      utm_content: "embedding-sdk-admin",
      source_plan: plan,
    })}`;

  const isHosted = useSetting("is-hosted?");

  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, {
      utm_campaign: "embedding-sdk",
      utm_content: "embedding-sdk-admin",
    }),
  );

  const sdkOriginsSetting = useMergeSetting(
    !isEE
      ? {
          key: "embedding-app-origins-sdk",
          placeholder: "https://*.example.com",
          display_name: t`Cross-Origin Resource Sharing (CORS)`,
          description: jt`Try out the SDK on localhost. To enable other sites, ${(
            <ExternalLink key="upgrade-url" href={upgradeUrl}>
              {t`upgrade to Metabase Pro`}
            </ExternalLink>
          )} and Enter the origins for the websites or apps where you want to allow SDK embedding.`,
        }
      : {
          key: "embedding-app-origins-sdk",
          placeholder: "https://*.example.com",
          display_name: t`Cross-Origin Resource Sharing (CORS)`,
          description: t`Enter the origins for the websites or apps where you want to allow SDK embedding, separated by a space. Localhost is automatically included.`,
        },
  );

  function handleChangeSdkOrigins(value: string | null) {
    updateSetting({ key: sdkOriginsSetting.key }, value);
  }

  function handleToggleEmbeddingSdk(event: ChangeEvent<HTMLInputElement>) {
    updateSetting({ key: "enable-embedding-sdk" }, event.target.checked);
  }

  const { url: activationUrl } = useDocsUrl(
    "paid-features/activating-the-enterprise-edition",
  );

  const switchMetabaseBinariesUrl = addUtmToLink(activationUrl);

  const implementJwtUrl = addUtmToLink(
    getLearnUrl("metabase-basics/embedding/securing-embeds"),
  );

  const quickStartUrl = addUtmToLink("https://metaba.se/sdk-quick-start");
  const documentationUrl = addUtmToLink("https://metaba.se/sdk-docs");

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
            switch Metabase binaries
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
    <Box p="0.5rem 1rem 0">
      <Stack spacing="2.5rem">
        <Breadcrumbs
          size="large"
          crumbs={[
            [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
            [t`Embedding SDK for React`],
          ]}
        />

        <Switch
          label={t`Enable Embedded analytics SDK`}
          labelPosition="left"
          size="sm"
          checked={isEmbeddingSdkEnabled}
          onChange={handleToggleEmbeddingSdk}
        />

        <Alert
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
            setting={
              !isEE
                ? {
                    display_name: t`Try Embedded analytics SDK`,
                    description: t`Use the SDK with API keys for development.`,
                  }
                : {
                    display_name: t`Get started`,
                  }
            }
          />
          <Button
            variant="outline"
            component={ExternalLink}
            href={quickStartUrl}
          >{t`Check out the Quick Start`}</Button>
        </Box>

        <Box>
          <SettingHeader
            id={sdkOriginsSetting.key}
            setting={sdkOriginsSetting}
          />
          <SetByEnvVarWrapper setting={sdkOriginsSetting}>
            <SettingTextInput
              id={sdkOriginsSetting.key}
              setting={sdkOriginsSetting}
              onChange={handleChangeSdkOrigins}
              type="text"
              disabled={!canEditSdkOrigins}
            />
          </SetByEnvVarWrapper>
        </Box>

        {isEE && isHosted && (
          <Box>
            <SettingHeader
              id="version-pinning"
              setting={{
                display_name: t`Version pinning`,
                description: t`Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.`,
              }}
            />
            <Button
              compact
              variant="outline"
              leftIcon={<Icon size={12} name="mail" aria-hidden />}
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
      </Stack>
    </Box>
  );
}
