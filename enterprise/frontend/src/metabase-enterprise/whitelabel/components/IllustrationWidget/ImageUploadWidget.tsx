import type { ChangeEvent } from "react";
import type React from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import CS from "metabase/css/core/index.css";
import { Box, Button, Flex, Icon, Paper, Text } from "metabase/ui";
import type { EnterpriseSettingKey } from "metabase-types/api";

import { PreviewImage } from "./IllustrationWidget.styled";

const MB = 1024 * 1024;
const IMAGE_SIZE_LIMIT = 2 * MB;

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

  function handleFileUpload(fileEvent: ChangeEvent<HTMLInputElement>) {
    setErrorMessage("");
    if (fileEvent.target.files && fileEvent.target.files.length > 0) {
      const file = fileEvent.target.files[0];
      if (file.size > IMAGE_SIZE_LIMIT) {
        setErrorMessage(
          t`The image you chose is larger than 2MB. Please choose another one.`,
        );
        return;
      }

      const reader = new FileReader();
      reader.onload = async (readerEvent) => {
        const dataUri = readerEvent.target?.result as string;
        if (!(await isFileIntact(dataUri))) {
          setErrorMessage(
            t`The image you chose is corrupted. Please choose another one.`,
          );
          return;
        }
        setErrorMessage("");
        setFileName(file.name);
        await updateSetting({
          key: name,
          value: dataUri,
        });
      };
      reader.readAsDataURL(file);
    }
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
        <Text size="sm" c="error" mb="sm">
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
              style={{ borderRight: "1px solid var(--mb-color-border)" }}
            >
              {!isDefaultImage && typeof imageSource === "string" && (
                <PreviewImage src={imageSource} aria-label={t`Image preview`} />
              )}
            </Flex>
            <Flex p="lg" gap="md" direction="column" justify="center" w="100%">
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
                  accept="image/jpeg,image/png,image/svg+xml"
                  multiple={false}
                />
                <Text ml="lg" truncate="end">
                  {isDefaultImage
                    ? t`No file chosen`
                    : fileName
                      ? fileName
                      : t`Remove uploaded image`}
                </Text>
                {!isDefaultImage && (
                  <Button
                    leftSection={<Icon name="close" />}
                    variant="subtle"
                    c="text-primary"
                    ml="md"
                    size="compact-md"
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

async function isFileIntact(dataUri: string) {
  return new Promise((resolve) => {
    const image = document.createElement("img");
    image.src = dataUri;
    image.onerror = () => resolve(false);
    image.onload = () => resolve(true);
  });
}
