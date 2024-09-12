import type { ChangeEvent } from "react";
import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { getUpgradeUrl } from "metabase/selectors/settings";
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

  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, {
      utm_campaign: "embedding-sdk",
      utm_content: "embedding-sdk-settings",
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
          label={t`Enable Embedding SDK for React`}
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
          <Text size="sm">
            {!isEE
              ? jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, switch Metabase binaries, ${(
                  <ExternalLink key="upgrade-url" href={upgradeUrl}>
                    {t`upgrade to Metabase Pro`}
                  </ExternalLink>
                )} and implement JWT SSO.`
              : jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, implement JWT SSO.`}
          </Text>
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
            href="https://www.npmjs.com/package/@metabase/embedding-sdk-react"
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

        <Text>
          {jt`Check out the ${(
            <ExternalLink
              key="sdk-doc"
              href="https://www.npmjs.com/package/@metabase/embedding-sdk-react"
            >
              {t`documentation`}
            </ExternalLink>
          )} for more.`}
        </Text>
      </Stack>
    </Box>
  );
}
