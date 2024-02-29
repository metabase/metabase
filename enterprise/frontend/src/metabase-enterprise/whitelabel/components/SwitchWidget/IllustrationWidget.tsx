import type { ChangeEvent } from "react";
import { useState, useRef } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Button, Flex, Icon, Paper, Select, Text } from "metabase/ui";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-enterprise/settings/types";

import { LighthouseImage } from "./IllustrationWidget.styled";

type IllustrationValue = "default" | "no-illustration" | "custom";

interface StringSetting {
  value: IllustrationValue;
  default: string;
}

type IllustrationWidgetProps = {
  setting: StringSetting;
  onChange: (value: string) => void;
  onChangeSetting: (key: EnterpriseSettingKey, value: unknown) => void;
  settingValues: EnterpriseSettings;
};

const data = [
  { label: t`Lighthouse`, value: "default" },
  { label: t`No illustration`, value: "no-illustration" },
  { label: t`Custom`, value: "custom" },
];

export function IllustrationWidget({
  setting,
  onChange,
  onChangeSetting,
  settingValues,
}: IllustrationWidgetProps) {
  const value = setting.value ?? setting.default;
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleChange(value: IllustrationValue) {
    // Avoid saving the same value
    if (value === setting.value) {
      return;
    }

    if (value === "custom" && settingValues["login-page-illustration-custom"]) {
      onChange("custom");
    } else if (value === "custom") {
      fileInputRef.current?.click();
    } else {
      onChange(value);
    }
  }

  function handleFileUpload(fileEvent: ChangeEvent<HTMLInputElement>) {
    if (fileEvent.target.files && fileEvent.target.files.length > 0) {
      const file = fileEvent.target.files[0];

      const reader = new FileReader();
      reader.onload = readerEvent => {
        setFileName(file.name);
        onChange("custom");
        onChangeSetting(
          "login-page-illustration-custom",
          readerEvent.target?.result as string,
        );
      };
      reader.readAsDataURL(file);
    }
  }

  function handleRemoveCustomIllustration() {
    if (fileInputRef.current?.value) {
      fileInputRef.current.value = "";
    }
    setFileName("");
    onChange("default");
    onChangeSetting("login-page-illustration-custom", null);
  }

  const isCustomIllustration = value === "custom";

  return (
    <Paper withBorder shadow="none">
      <Flex>
        <Flex
          align="center"
          justify="center"
          w="7.5rem"
          style={{ borderRight: `1px solid ${color("border")}` }}
        >
          {getPreviewImage(
            value,
            settingValues["login-page-illustration-custom"],
          )}
        </Flex>
        <Flex p="lg" w="25rem" align="center" gap="sm">
          <Select
            data={data}
            value={value}
            onChange={handleChange}
            w={isCustomIllustration && fileName ? "8.25rem" : "100%"}
            style={{
              flexShrink: isCustomIllustration && fileName ? 0 : undefined,
            }}
          />
          {isCustomIllustration && (
            <Text truncate="end" ml="auto">
              {fileName}
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
            />
          )}
          <input
            hidden
            ref={fileInputRef}
            onChange={handleFileUpload}
            type="file"
            accept="image/jpeg,image/png,image/svg+xml"
            multiple={false}
          />
        </Flex>
      </Flex>
    </Paper>
  );
}

function getPreviewImage(value: IllustrationValue, customSource?: string) {
  if (value === "default") {
    return <LighthouseImage />;
  }

  if (value === "no-illustration") {
    return null;
  }

  if (value === "custom") {
    return <img src={customSource} width={100} />;
  }

  return null;
}
