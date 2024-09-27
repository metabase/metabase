import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { Box } from "metabase/ui";

import SettingHeader from "../../SettingHeader";
import { SetByEnvVarWrapper } from "../../SettingsSetting";
import { SettingTextInput } from "../../widgets/SettingTextInput";
import { useEmbeddingSetting, useMergeSetting } from "../hooks";

import { useEmbeddingSettingsLinks } from "./sdk";

export const CorsOriginInput = () => {
  const isEE = PLUGIN_EMBEDDING_SDK.isEnabled();
  const enableEmbeddingSdkSetting = useMergeSetting({
    key: "enable-embedding-sdk",
  });
  const isEmbeddingSdkEnabled = Boolean(enableEmbeddingSdkSetting.value);
  const canEditSdkOrigins = isEE && isEmbeddingSdkEnabled;

  const { upgradeUrl } = useEmbeddingSettingsLinks();

  const [sdkOriginsSetting, handleChangeSdkOrigins] = useEmbeddingSetting(
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

  return (
    <Box>
      <SetByEnvVarWrapper setting={sdkOriginsSetting}>
        <SettingHeader id={sdkOriginsSetting.key} setting={sdkOriginsSetting} />
        <SettingTextInput
          id={sdkOriginsSetting.key}
          setting={sdkOriginsSetting}
          onChange={handleChangeSdkOrigins}
          type="text"
          disabled={!canEditSdkOrigins}
        />
      </SetByEnvVarWrapper>
    </Box>
  );
};
