import type { ChangeEvent } from "react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { LighthouseIllustrationThumbnail } from "metabase/common/components/LighthouseIllustration";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { useAdminSetting } from "metabase/settings";
import {
  BasicAdminSettingInput,
  SettingHeader,
} from "metabase/settings-components";
import { Box, Button, Flex, Icon, Image, Paper, Text } from "metabase/ui";
import {
  getIsDefaultMetabaseLogo,
  getLogoUrl,
} from "metabase-enterprise/settings/selectors";
import type {
  EnterpriseSettingKey,
  IllustrationSettingValue,
} from "metabase-types/api";

import { ACCEPTED_IMAGE_TYPES, readImageFile } from "../../lib/image-file";
import {
  type IllustrationType,
  ImageUploadInfoDot,
} from "../ImageUploadInfoDot";

import { PreviewImage, SailboatImage } from "./IllustrationWidget.styled";
export interface StringSetting {
  value: IllustrationSettingValue | null;
  default: IllustrationSettingValue;
}

type IllustrationSetting = Extract<
  EnterpriseSettingKey,
  | "login-page-illustration"
  | "landing-page-illustration"
  | "no-data-illustration"
  | "no-object-illustration"
  | "pdf-export-logo"
>;

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
    case "pdf-export-logo":
      return "logo";
  }
};

const getSelectOptions = (): Record<IllustrationType, SelectOption[]> => ({
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
  logo: [
    { label: t`Application logo`, value: "default" },
    { label: t`No logo`, value: "none" },
    { label: t`Custom`, value: "custom" },
  ],
});

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
  const applicationLogoUrl = useSelector(getLogoUrl);
  const isDefaultMetabaseLogo = useSelector(getIsDefaultMetabaseLogo);
  const type = getIllustrationType(name);
  const options = getSelectOptions()[type];
  const customIllustrationSettingName =
    // Unjustified type cast. FIXME
    `${name}-custom` as EnterpriseSettingKey;
  const {
    value: settingValue,
    updateSetting,
    settingDetails,
  } = useAdminSetting(name);
  const {
    value: customIllustrationSource,
    settingDetails: customSourceDetails,
  } = useAdminSetting(customIllustrationSettingName);

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

  async function handleFileUpload(fileEvent: ChangeEvent<HTMLInputElement>) {
    const file = fileEvent.target.files?.[0];
    if (!file) {
      return;
    }

    const result = await readImageFile(file);
    if (result.status === "error") {
      setErrorMessage(result.message);
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
      value: result.dataUri,
      toast: false,
    });
  }

  async function handleRemoveCustomIllustration() {
    if (fileInputRef.current?.value) {
      fileInputRef.current.value = "";
    }
    setFileName("");
    await updateSetting({
      key: name,
      value: "default",
    });
    await updateSetting({
      key: customIllustrationSettingName,
      value: null,
      toast: false,
    });
  }

  return (
    <Box data-testid={`${name}-setting`}>
      <SettingHeader id={name} title={title} description={description} />
      {errorMessage && (
        <Text size="sm" c="feedback-negative" mb="sm">
          {errorMessage}
        </Text>
      )}

      <Paper withBorder shadow="none">
        <Flex>
          <Flex
            align="center"
            justify="center"
            w="7.5rem"
            pos="relative"
            style={{ borderRight: "1px solid var(--mb-color-border-neutral)" }}
          >
            {getPreviewImage({
              value: localValue,
              // Unjustified type cast. FIXME
              customSource: customIllustrationSource as string,
              defaultPreviewType: type,
              customApplicationLogoUrl: isDefaultMetabaseLogo
                ? null
                : applicationLogoUrl,
            })}
          </Flex>
          <Flex p="xl" gap="lg" direction="column" justify="center" w="100%">
            {settingDetails?.is_env_setting && settingDetails?.env_name ? (
              <SetByEnvVar varName={settingDetails.env_name} />
            ) : (
              <BasicAdminSettingInput
                name={name}
                inputType="select"
                value={settingValue}
                options={options}
                onChange={(newValue) =>
                  // Unjustified type cast. FIXME
                  handleChange(newValue as IllustrationSettingValue)
                }
              />
            )}
            {localValue === "custom" &&
              (customSourceDetails?.is_env_setting &&
              customSourceDetails?.env_name ? (
                <SetByEnvVar varName={customSourceDetails.env_name} />
              ) : (
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
                    id={name}
                    accept={ACCEPTED_IMAGE_TYPES}
                    multiple={false}
                  />
                  <Text ml="xl" truncate="end">
                    {!customIllustrationSource
                      ? t`No file chosen`
                      : fileName
                        ? fileName
                        : t`Remove uploaded image`}
                  </Text>
                  {/* TODO: replace with ActionIcon (GDGT-2457) */}
                  {customIllustrationSource && (
                    <Button
                      variant="subtle"
                      color="neutral"
                      size="sm"
                      leftSection={<Icon name="close" />}
                      ml="lg"
                      onClick={handleRemoveCustomIllustration}
                      aria-label={t`Remove custom illustration`}
                    />
                  )}
                </Flex>
              ))}
          </Flex>
        </Flex>
      </Paper>
    </Box>
  );
}

const LOGO_PREVIEW_WIDTH = 100;
const LOGO_PREVIEW_HEIGHT = 90;

function LogoPreview({ src }: { src: string }) {
  return (
    <Image
      src={src}
      w={LOGO_PREVIEW_WIDTH}
      h={LOGO_PREVIEW_HEIGHT}
      fit="contain"
      alt={t`Logo preview`}
    />
  );
}

interface GetPreviewImageProps {
  value: IllustrationSettingValue;
  customSource: string | undefined;
  defaultPreviewType: IllustrationType;
  /** `null` while the application still uses the stock Metabase logo, which never appears in PDF exports. */
  customApplicationLogoUrl: string | null;
}

function getPreviewImage({
  value,
  customSource,
  defaultPreviewType,
  customApplicationLogoUrl,
}: GetPreviewImageProps) {
  if (value === "default") {
    return getDefaultPreviewImage(defaultPreviewType, customApplicationLogoUrl);
  }

  if (value === "none" || !customSource) {
    return null;
  }

  if (defaultPreviewType === "logo") {
    return <LogoPreview src={customSource} />;
  }

  return <PreviewImage src={customSource} />;
}

function getDefaultPreviewImage(
  type: IllustrationType,
  customApplicationLogoUrl: string | null,
) {
  switch (type) {
    case "background":
      return <LighthouseIllustrationThumbnail />;
    case "icon":
      return <SailboatImage />;
    case "logo":
      return customApplicationLogoUrl ? (
        <LogoPreview src={customApplicationLogoUrl} />
      ) : null;
  }
}
