import type { ChangeEvent } from "react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { BasicAdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import CS from "metabase/css/core/index.css";
import { Box, Button, Flex, Icon, Paper, Text } from "metabase/ui";
import type {
  EnterpriseSettingKey,
  IllustrationSettingValue,
} from "metabase-types/api";

import { ImageUploadInfoDot } from "../ImageUploadInfoDot";

import {
  LighthouseImage,
  PreviewImage,
  SailboatImage,
} from "./IllustrationWidget.styled";

export interface StringSetting {
  value: IllustrationSettingValue | null;
  default: IllustrationSettingValue;
}

type IllustrationType = "background" | "icon";

type IllustrationSetting = Extract<
  EnterpriseSettingKey,
  | "login-page-illustration"
  | "landing-page-illustration"
  | "no-data-illustration"
  | "no-object-illustration"
>;

const MB = 1024 * 1024;
const IMAGE_SIZE_LIMIT = 2 * MB;

interface SelectOption {
  label: string;
  value: IllustrationSettingValue;
}

const getIllustrationType = (
  settingName: IllustrationSetting,
): IllustrationType => {
  switch (settingName) {
    case "login-page-illustration":
    case "landing-page-illustration":
      return "background";
    case "no-data-illustration":
    case "no-object-illustration":
      return "icon";
  }
};

const SELECT_OPTIONS: Record<IllustrationType, SelectOption[]> = {
  background: [
    { label: t`Lighthouse`, value: "default" },
    { label: t`No illustration`, value: "none" },
    { label: t`Custom`, value: "custom" },
  ],
  icon: [
    { label: t`Sailboat`, value: "default" },
    { label: t`No illustration`, value: "none" },
    { label: t`Custom`, value: "custom" },
  ],
} as const;

export function IllustrationWidget({
  name,
  title,
  description,
}: {
  name: IllustrationSetting;
  title: string;
  description?: React.ReactNode;
}) {
  const [localValue, setLocalValue] =
    useState<IllustrationSettingValue>("default");
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const type = getIllustrationType(name);
  const options = SELECT_OPTIONS[type];
  const customIllustrationSettingName =
    `${name}-custom` as EnterpriseSettingKey;
  const { value: settingValue, updateSetting } = useAdminSetting(name);
  const { value: customIllustrationSource } = useAdminSetting(
    customIllustrationSettingName,
  );

  useEffect(() => {
    setLocalValue(settingValue ?? "default");
  }, [settingValue]);

  async function handleChange(value: IllustrationSettingValue) {
    setLocalValue(value);
    setErrorMessage("");
    // Avoid saving the same value
    if (value === settingValue) {
      return;
    }

    if (value === "custom" && customIllustrationSource) {
      await updateSetting({
        key: name,
        value: "custom",
      });
    } else if (value !== "custom") {
      await updateSetting({
        key: name,
        value: value ?? "none",
      });
    }
  }

  function handleFileUpload(fileEvent: ChangeEvent<HTMLInputElement>) {
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
        // Setting 2 setting values at the same time could result in one of them not being saved
        await updateSetting({
          key: name,
          value: "custom",
        });
        await updateSetting({
          key: customIllustrationSettingName,
          value: dataUri,
        });
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleRemoveCustomIllustration() {
    if (fileInputRef.current?.value) {
      fileInputRef.current.value = "";
    }
    setFileName("");
    // Setting 2 setting values at the same time could result in one of them not being saved

    await updateSetting({
      key: name,
      value: "none",
    });
    await updateSetting({
      key: customIllustrationSettingName,
      value: null,
    });
  }

  return (
    <Box maw="36rem">
      <SettingHeader id={name} title={title} description={description} />
      {errorMessage && (
        <Text size="sm" c="error" mb="sm">
          {errorMessage}
        </Text>
      )}
      <Paper withBorder shadow="none">
        <Flex>
          <Flex
            align="center"
            justify="center"
            w="7.5rem"
            style={{ borderRight: "1px solid var(--mb-color-border)" }}
          >
            {getPreviewImage({
              value: localValue,
              customSource: customIllustrationSource as string,
              defaultPreviewType: type,
            })}
          </Flex>
          <Flex p="lg" gap="md" direction="column" justify="center" w="100%">
            <BasicAdminSettingInput
              name={name}
              inputType="select"
              value={settingValue}
              options={options}
              onChange={(newValue) =>
                handleChange(newValue as IllustrationSettingValue)
              }
            />
            {localValue === "custom" && (
              <Flex w="100%" align="center">
                <Button
                  className={CS.flexNoShrink}
                  onClick={() => fileInputRef.current?.click()}
                >{t`Choose File`}</Button>
                <Box ml="sm">
                  <ImageUploadInfoDot type={type} />
                </Box>
                <input
                  data-testid="file-input"
                  ref={fileInputRef}
                  hidden
                  onChange={handleFileUpload}
                  type="file"
                  accept="image/jpeg,image/png,image/svg+xml"
                  multiple={false}
                />
                <Text ml="lg" truncate="end">
                  {!customIllustrationSource
                    ? t`No file chosen`
                    : fileName
                      ? fileName
                      : t`Remove uploaded image`}
                </Text>
                {customIllustrationSource && (
                  <Button
                    leftSection={<Icon name="close" />}
                    variant="subtle"
                    c="text-dark"
                    ml="md"
                    size="compact-md"
                    onClick={handleRemoveCustomIllustration}
                    aria-label={t`Remove custom illustration`}
                  />
                )}
              </Flex>
            )}
          </Flex>
        </Flex>
      </Paper>
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

const PREVIEW_ELEMENTS: Record<IllustrationType, JSX.Element> = {
  background: <LighthouseImage />,
  icon: <SailboatImage />,
};

interface GetPreviewImageProps {
  value: IllustrationSettingValue;
  customSource: string | undefined;
  defaultPreviewType: IllustrationType;
}

function getPreviewImage({
  value,
  customSource,
  defaultPreviewType,
}: GetPreviewImageProps) {
  if (value === "default") {
    return PREVIEW_ELEMENTS[defaultPreviewType];
  }

  if (value === "none") {
    return null;
  }

  if (value === "custom" && customSource) {
    return <PreviewImage src={customSource} />;
  }

  return null;
}
