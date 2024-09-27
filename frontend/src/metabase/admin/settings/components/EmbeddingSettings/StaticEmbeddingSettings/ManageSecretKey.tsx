import { t } from "ttag";

import { Box } from "metabase/ui";

import SettingHeader from "../../SettingHeader";
import { SetByEnvVarWrapper } from "../../SettingsSetting";
import SecretKeyWidget from "../../widgets/SecretKeyWidget";
import { useEmbeddingSetting } from "../hooks";

const EMBEDDING_SECRET_KEY_SETTING = {
  key: "embedding-secret-key",
  display_name: t`Embedding secret key`,
  description: t`Standalone Embed Secret Key used to sign JSON Web Tokens for requests to /api/embed endpoints. This lets you create a secure environment limited to specific users or organizations.`,
} as const;

export const ManageSecretKey = () => {
  const [embeddingSecretKeySetting, handleChangeEmbeddingSecretKey] =
    useEmbeddingSetting(EMBEDDING_SECRET_KEY_SETTING);

  return (
    <Box data-testid="embedding-secret-key-setting">
      <SetByEnvVarWrapper setting={embeddingSecretKeySetting}>
        <SettingHeader
          id="setting-embedding-secret-key"
          setting={embeddingSecretKeySetting}
        />
        <SecretKeyWidget
          id="setting-embedding-secret-key"
          onChange={handleChangeEmbeddingSecretKey}
          setting={embeddingSecretKeySetting}
          confirmation={{
            header: t`Regenerate embedding key?`,
            dialog: t`This will cause existing embeds to stop working until they are updated with the new key.`,
          }}
        />
      </SetByEnvVarWrapper>
    </Box>
  );
};
