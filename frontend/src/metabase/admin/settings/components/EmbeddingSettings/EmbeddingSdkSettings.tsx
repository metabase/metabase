import { useMemo } from "react";
import { jt, t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { Box, Stack } from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { getSettings } from "../../selectors";
import SettingHeader from "../SettingHeader";
import { SetByEnvVarWrapper } from "../SettingsSetting";
import { SettingTextInput } from "../widgets/SettingTextInput";

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

  function onChangeSdkOrigins(value: string | null) {
    updateSetting({ key: SDK_ORIGINS_SETTING.key }, value);
  }
  const hasEmbeddingSdkFeature = PLUGIN_EMBEDDING_SDK.isEnabled();

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
        <Box>
          <SettingHeader
            id={sdkOriginsSetting.key}
            setting={sdkOriginsSetting}
          />
          <SetByEnvVarWrapper setting={sdkOriginsSetting}>
            <SettingTextInput
              id={sdkOriginsSetting.key}
              setting={sdkOriginsSetting}
              onChange={onChangeSdkOrigins}
              type="text"
              disabled={!hasEmbeddingSdkFeature}
            />
          </SetByEnvVarWrapper>
        </Box>
      </Stack>
    </Box>
  );
}

type DisplaySetting = { key: SettingKey };
function useMergeSetting(displaySetting: DisplaySetting) {
  const apiSetting = useSelector(getSettings).find(
    (setting: any) => setting.key === displaySetting.key,
  );
  const mergedSetting = useMemo(() => {
    return {
      ...apiSetting,
      ...displaySetting,
    };
  }, [apiSetting, displaySetting]);

  return mergedSetting;
}
