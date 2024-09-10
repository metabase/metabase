import { type ChangeEvent, useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { useSelector } from "metabase/lib/redux";
import { Box, Stack, Switch } from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { getSettings } from "../../selectors";
import SettingHeader from "../SettingHeader";
import { SettingTitle } from "../SettingHeader/SettingHeader.styled";
import { SetByEnvVarWrapper } from "../SettingsSetting";
import { EmbeddedResources } from "../widgets/PublicLinksListing";
import SecretKeyWidget from "../widgets/SecretKeyWidget";

import type { AdminSettingComponentProps } from "./types";

const EMBEDDING_SECRET_KEY_SETTING = {
  key: "embedding-secret-key",
  display_name: t`Embedding secret key`,
  description: t`Standalone Embed Secret Key used to sign JSON Web Tokens for requests to /api/embed endpoints. This lets you create a secure environment limited to specific users or organizations.`,
} as const;

export function StaticEmbeddingSettings({
  updateSetting,
}: AdminSettingComponentProps) {
  const embeddingSecretKeySetting = useMergeSetting(
    EMBEDDING_SECRET_KEY_SETTING,
  );

  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");

  function handleChangeEmbeddingSecretKey(value: string | null) {
    updateSetting({ key: EMBEDDING_SECRET_KEY_SETTING.key }, value);
  }

  function handleToggleStaticEmbedding(event: ChangeEvent<HTMLInputElement>) {
    updateSetting({ key: "enable-embedding-static" }, event.target.checked);
  }

  return (
    <Box p="0.5rem 1rem 0">
      <Stack spacing="2.5rem">
        <Breadcrumbs
          size="large"
          crumbs={[
            [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
            [t`Static embedding`],
          ]}
        />
        <Switch
          label={t`Enable Static embedding`}
          labelPosition="left"
          size="sm"
          checked={isStaticEmbeddingEnabled}
          onChange={handleToggleStaticEmbedding}
        />
        <Box>
          <SettingHeader
            id={embeddingSecretKeySetting.key}
            setting={embeddingSecretKeySetting}
          />
          <SetByEnvVarWrapper setting={embeddingSecretKeySetting}>
            <SecretKeyWidget
              onChange={handleChangeEmbeddingSecretKey}
              setting={embeddingSecretKeySetting}
              confirmation={{
                header: t`Regenerate embedding key?`,
                dialog: t`This will cause existing embeds to stop working until they are updated with the new key.`,
              }}
            />
          </SetByEnvVarWrapper>
        </Box>
        <Box>
          <SettingTitle>{t`Manage embeds`}</SettingTitle>
          <EmbeddedResources />
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
