import type { ChangeEvent } from "react";
import type React from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import CS from "metabase/css/core/index.css";
import { useAdminSetting } from "metabase/settings";
import { SettingHeader } from "metabase/settings-components";
import { Box, Button, Flex, Icon, Paper, Text } from "metabase/ui";
import type { EnterpriseSettingKey } from "metabase-types/api";

import { ACCEPTED_IMAGE_TYPES, readImageFile } from "../../lib/image-file";

import { PreviewImage } from "./IllustrationWidget.styled";

export function ImageUploadWidget({
  name,
  title,
  description: descriptionProp,
}: {
  name: EnterpriseSettingKey;
  title: string;
  description?: React.ReactNode;
}) {
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    value: imageSource,
    updateSetting,
    settingDetails,
    description,
  } = useAdminSetting(name);

  async function handleFileUpload(fileEvent: ChangeEvent<HTMLInputElement>) {
    setErrorMessage("");
    const file = fileEvent.target.files?.[0];
    if (!file) {
      return;
    }

    const result = await readImageFile(file);
    if (result.status === "error") {
      setErrorMessage(result.message);
      return;
    }
    setFileName(file.name);
    await updateSetting({
      key: name,
      value: result.dataUri,
    });
  }

  const isDefaultImage = imageSource === settingDetails?.default;

  async function handleRemove() {
    setErrorMessage("");
    if (fileInputRef.current?.value) {
      fileInputRef.current.value = "";
    }
    setFileName("");
    await updateSetting({
      key: name,
      value: null,
    });
  }

  return (
    <Box maw="36rem" data-testid={`${name}-setting`}>
      <SettingHeader
        id={name}
        title={title}
        description={descriptionProp ?? description}
      />
      {errorMessage && (
        <Text size="sm" c="feedback-negative" mb="sm">
          {errorMessage}
        </Text>
      )}
      {settingDetails?.is_env_setting && settingDetails?.env_name ? (
        <SetByEnvVar varName={settingDetails.env_name} />
      ) : (
        <Paper withBorder shadow="none">
          <Flex>
            <Flex
              align="center"
              justify="center"
              w="7.5rem"
              style={{
                borderRight: "1px solid var(--mb-color-border-neutral)",
              }}
            >
              {!isDefaultImage && typeof imageSource === "string" && (
                <PreviewImage src={imageSource} aria-label={t`Image preview`} />
              )}
            </Flex>
            <Flex p="xl" gap="lg" direction="column" justify="center" w="100%">
              <Flex w="100%" align="center">
                <Button
                  className={CS.flexNoShrink}
                  onClick={() => fileInputRef.current?.click()}
                >{t`Choose File`}</Button>
                <input
                  data-testid="file-input"
                  id={name}
                  ref={fileInputRef}
                  hidden
                  onChange={handleFileUpload}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  multiple={false}
                />
                <Text ml="xl" truncate="end">
                  {isDefaultImage
                    ? t`No file chosen`
                    : fileName
                      ? fileName
                      : t`Remove uploaded image`}
                </Text>
                {/* TODO: replace with ActionIcon (GDGT-2457) */}
                {!isDefaultImage && (
                  <Button
                    variant="subtle"
                    color="neutral"
                    size="sm"
                    leftSection={<Icon name="close" />}
                    ml="lg"
                    onClick={handleRemove}
                    aria-label={t`Remove custom illustration`}
                  />
                )}
              </Flex>
            </Flex>
          </Flex>
        </Paper>
      )}
    </Box>
  );
}
