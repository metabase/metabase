import type { ChangeEvent } from "react";
import { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Box, Button, Flex, Icon, Paper, Select, Text } from "metabase/ui";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
  IllustrationSettingValue,
} from "metabase-enterprise/settings/types";

import {
  LighthouseImage,
  SailboatImage,
  PreviewImage,
} from "./IllustrationWidget.styled";

export interface StringSetting {
  value: IllustrationSettingValue | null;
  default: IllustrationSettingValue;
}

type IllustrationWidgetProps = {
  id?: string;
  setting: StringSetting;
  onChange: (value: IllustrationSettingValue) => Promise<void>;
  onChangeSetting: (key: EnterpriseSettingKey, value: unknown) => Promise<void>;
  settingValues: Partial<EnterpriseSettings>;
  defaultIllustrationLabel: string;
  customIllustrationSetting:
    | "login-page-illustration-custom"
    | "landing-page-illustration-custom"
    | "no-question-results-illustration-custom"
    | "no-search-results-illustration-custom";
  errorMessageContainerId: string;
  imageUploadInfoDot: JSX.Element;
  defaultPreviewType: "lighthouse" | "sailboat";
};

const MB = 1024 * 1024;
const IMAGE_SIZE_LIMIT = 2 * MB;

export function IllustrationWidget({
  id,
  setting,
  onChange,
  onChangeSetting,
  settingValues,
  defaultIllustrationLabel,
  customIllustrationSetting,
  errorMessageContainerId,
  imageUploadInfoDot,
  defaultPreviewType,
}: IllustrationWidgetProps) {
  const [value, setValue] = useState(setting.value ?? setting.default);
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const data = useMemo(
    () => [
      { label: defaultIllustrationLabel, value: "default" },
      { label: t`No illustration`, value: "no-illustration" },
      { label: t`Custom`, value: "custom" },
    ],
    [defaultIllustrationLabel],
  );
  const customIllustrationSource =
    settingValues[customIllustrationSetting] ?? undefined;

  async function handleChange(value: IllustrationSettingValue) {
    setValue(value);
    setErrorMessage("");
    // Avoid saving the same value
    // When setting.value is set to the default value its value would be `null`
    if (value === (setting.value ?? setting.default)) {
      return;
    }

    if (value === "custom" && customIllustrationSource) {
      await onChange("custom");
    } else if (value !== "custom") {
      await onChange(value);
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
      reader.onload = async readerEvent => {
        const dataUri = readerEvent.target?.result as string;
        if (!(await isFileIntact(dataUri))) {
          setErrorMessage(
            t`The image you chose is corrupted. Please choose another one.`,
          );
          return;
        }
        setFileName(file.name);
        // Setting 2 setting values at the same time could result in one of them not being saved
        await onChange("custom");
        await onChangeSetting(customIllustrationSetting, dataUri);
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
    setValue("default");
    await onChange("default");
    await onChangeSetting(customIllustrationSetting, null);
  }

  const errorMessageContainer = document.getElementById(
    errorMessageContainerId,
  );

  return (
    <Paper withBorder shadow="none">
      <Flex>
        <Flex
          align="center"
          justify="center"
          w="7.5rem"
          style={{ borderRight: `1px solid ${color("border")}` }}
        >
          {getPreviewImage({
            value: value,
            customSource: customIllustrationSource,
            defaultPreviewType,
          })}
        </Flex>
        <Flex p="lg" w="25rem" align="center" gap="md" direction="column">
          <Select
            id={id}
            data={data}
            value={value}
            onChange={handleChange}
            w="100%"
            error={Boolean(errorMessage)}
          />
          {value === "custom" && (
            <Flex w="100%" align="center">
              <Button
                style={{ flexShrink: 0 }}
                onClick={() => fileInputRef.current?.click()}
              >{t`Choose File`}</Button>
              {<Box ml="sm">{imageUploadInfoDot}</Box>}
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
                  leftIcon={<Icon name="close" />}
                  variant="subtle"
                  c="text-dark"
                  ml="md"
                  compact
                  onClick={handleRemoveCustomIllustration}
                  aria-label={t`Remove custom illustration`}
                />
              )}
            </Flex>
          )}
        </Flex>
      </Flex>
      {errorMessage &&
        errorMessageContainer &&
        createPortal(errorMessage, errorMessageContainer)}
    </Paper>
  );
}

async function isFileIntact(dataUri: string) {
  return new Promise(resolve => {
    const image = document.createElement("img");
    image.src = dataUri;
    image.onerror = () => resolve(false);
    image.onload = () => resolve(true);
  });
}

const PREVIEW_ELEMENTS: Record<
  IllustrationWidgetProps["defaultPreviewType"],
  JSX.Element
> = {
  lighthouse: <LighthouseImage />,
  sailboat: <SailboatImage />,
};

interface GetPreviewImageProps {
  value: IllustrationSettingValue;
  customSource: string | undefined;
  defaultPreviewType: IllustrationWidgetProps["defaultPreviewType"];
}

function getPreviewImage({
  value,
  customSource,
  defaultPreviewType,
}: GetPreviewImageProps) {
  if (value === "default") {
    return PREVIEW_ELEMENTS[defaultPreviewType];
  }

  if (value === "no-illustration") {
    return null;
  }

  if (value === "custom" && customSource) {
    return <PreviewImage src={customSource} />;
  }

  return null;
}
