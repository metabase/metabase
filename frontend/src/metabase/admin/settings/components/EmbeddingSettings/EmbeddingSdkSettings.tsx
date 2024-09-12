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

const SDK_ORIGINS_SETTING = {
  key: "embedding-app-origins-sdk",
  placeholder: "https://*.example.com",
  display_name: t`Cross-Origin Resource Sharing (CORS)`,
  description: jt`Enter the origins for the websites or web apps where you want to allow SDK embedding, separated by a space. Here are the ${(
    <ExternalLink
      key="specs"
      href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors"
    >
      {t`exact specifications`}
    </ExternalLink>
  )} for what can be entered.`,
} as const;

export function EmbeddingSdkSettings({
  updateSetting,
}: AdminSettingComponentProps) {
  const sdkOriginsSetting = useMergeSetting(SDK_ORIGINS_SETTING);

  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");

  function handleChangeSdkOrigins(value: string | null) {
    updateSetting({ key: sdkOriginsSetting.key }, value);
  }
  const hasEmbeddingSdkFeature = PLUGIN_EMBEDDING_SDK.isEnabled();
  const isEE = hasEmbeddingSdkFeature && isEmbeddingSdkEnabled;

  function handleToggleEmbeddingSdk(event: ChangeEvent<HTMLInputElement>) {
    updateSetting({ key: "enable-embedding-sdk" }, event.target.checked);
  }

  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, {
      utm_campaign: "embedding-sdk",
      utm_content: "embedding-sdk-settings",
    }),
  );

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
              disabled={!isEE}
            />
          </SetByEnvVarWrapper>
        </Box>
      </Stack>
    </Box>
  );
}
