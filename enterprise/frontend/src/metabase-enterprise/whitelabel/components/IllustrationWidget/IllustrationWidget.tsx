import type { ChangeEvent } from "react";
import { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Button, Flex, Icon, Paper, Select, Text } from "metabase/ui";
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
  defaultPreviewType,
}: IllustrationWidgetProps) {
  const value = setting.value ?? setting.default;
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

  async function handleChange(value: IllustrationSettingValue) {
    setErrorMessage("");
    // Avoid saving the same value
    // When setting.value is set to the default value its value would be `null`
    if (value === (setting.value ?? setting.default)) {
      return;
    }

    if (value === "custom" && settingValues[customIllustrationSetting]) {
      await onChange("custom");
    } else if (value === "custom") {
      fileInputRef.current?.click();
    } else {
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
    await onChange("default");
    await onChangeSetting(customIllustrationSetting, null);
  }

  const isCustomIllustration = value === "custom";
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
            value,
            customSource: settingValues[customIllustrationSetting] ?? undefined,
            defaultPreviewType,
          })}
        </Flex>
        <Flex p="lg" w="25rem" align="center" gap="sm">
          <Select
            id={id}
            data={data}
            value={value}
            onChange={handleChange}
            w={isCustomIllustration ? "8.25rem" : "100%"}
            style={{
              flexShrink: isCustomIllustration ? 0 : undefined,
            }}
            error={Boolean(errorMessage)}
          />
          {isCustomIllustration && (
            <Text truncate="end" ml="auto">
              {fileName ? fileName : t`Remove uploaded image`}
            </Text>
          )}
          {/**
           * <Select /> has an annoying 0.25rem top margin which I don't have time to fix yet.
           * This makes sure the X button is aligned with the Select component.
           */}
          {isCustomIllustration && (
            <Button
              leftIcon={<Icon name="close" />}
              mt="0.25rem"
              variant="subtle"
              c="text-dark"
              compact
              onClick={handleRemoveCustomIllustration}
              aria-label={t`Remove custom illustration`}
            />
          )}
          <input
            data-testid="file-input"
            hidden
            ref={fileInputRef}
            onChange={handleFileUpload}
            type="file"
            accept="image/jpeg,image/png,image/svg+xml"
            multiple={false}
          />
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

  if (value === "custom") {
    return <PreviewImage src={customSource} />;
  }

  return null;
}
