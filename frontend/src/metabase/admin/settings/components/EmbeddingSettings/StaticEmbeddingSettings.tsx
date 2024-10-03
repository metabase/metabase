import type { ChangeEvent } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { Box, Stack, Switch } from "metabase/ui";

import SettingHeader from "../SettingHeader";
import { SettingTitle } from "../SettingHeader/SettingHeader.styled";
import { SetByEnvVarWrapper } from "../SettingsSetting";
import { EmbeddedResources } from "../widgets/PublicLinksListing";
import SecretKeyWidget from "../widgets/SecretKeyWidget";

import { useMergeSetting } from "./hooks";
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
    updateSetting({ key: embeddingSecretKeySetting.key }, value);
  }

  function handleToggleStaticEmbedding(event: ChangeEvent<HTMLInputElement>) {
    updateSetting({ key: "enable-embedding-static" }, event.target.checked);
    // TODO: remove before merging integration branch
    updateSetting({ key: "enable-embedding" }, event.target.checked);
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
        <Box data-testid="embedding-secret-key-setting">
          <SettingHeader
            id="setting-embedding-secret-key"
            setting={embeddingSecretKeySetting}
          />
          <SetByEnvVarWrapper setting={embeddingSecretKeySetting}>
            <SecretKeyWidget
              id="setting-embedding-secret-key"
              key={isStaticEmbeddingEnabled.toString()}
              onChange={handleChangeEmbeddingSecretKey}
              setting={embeddingSecretKeySetting}
              confirmation={{
                header: t`Regenerate embedding key?`,
                dialog: t`This will cause existing embeds to stop working until they are updated with the new key.`,
              }}
            />
          </SetByEnvVarWrapper>
        </Box>
        <Box data-testid="embedded-resources">
          <SettingTitle>{t`Manage embeds`}</SettingTitle>
          <EmbeddedResources key={isStaticEmbeddingEnabled.toString()} />
        </Box>
      </Stack>
    </Box>
  );
}
