import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { SetByEnvVarWrapper } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import InputBlurChange from "metabase/common/components/InputBlurChange";
import { UtilApi } from "metabase/services";
import { Box, Button, Flex } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

export const EmbeddingSecretKeyWidget = () => {
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  const { value, updateSetting, settingDetails } = useAdminSetting(
    "embedding-secret-key",
  );

  const handleChange = async (newToken: string) => {
    updateSetting({
      key: "embedding-secret-key",
      value: newToken,
    });
  };

  const generateToken = async () => {
    const result = await UtilApi.random_token();
    handleChange(result.token);
  };

  return (
    <Box data-testid="embedding-secret-key-setting" maw="36rem">
      <SettingHeader
        id="embedding-secret-key"
        title={t`Embedding secret key`}
        description={t`Standalone Embed Secret Key used to sign JSON Web Tokens for requests to /api/embed endpoints. This lets you create a secure environment limited to specific users or organizations.`}
      />
      <SetByEnvVarWrapper
        settingDetails={settingDetails}
        settingKey="embedding-secret-key"
      >
        <Flex maw="52rem" py="md" gap="md" w="full">
          <InputBlurChange
            value={value}
            onBlurChange={(e) => handleChange(e.target.value)}
          />
          {value ? (
            <>
              <Button
                variant="filled"
                onClick={openModal}
                style={{ flexShrink: 0 }}
              >{t`Regenerate key`}</Button>
              <ConfirmModal
                opened={modalOpened}
                title={t`Regenerate embedding key?`}
                content={t`This will cause existing embeds to stop working until they are updated with the new key.`}
                onConfirm={() => {
                  generateToken();
                  closeModal();
                }}
                onClose={closeModal}
              />
            </>
          ) : (
            <Button
              variant="filled"
              onClick={generateToken}
              style={{ flexShrink: 0 }}
            >{t`Generate key`}</Button>
          )}
        </Flex>
      </SetByEnvVarWrapper>
    </Box>
  );
};
