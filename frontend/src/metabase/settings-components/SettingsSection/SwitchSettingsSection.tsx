import type React from "react";
import { useId } from "react";
import { t } from "ttag";

import {
  Box,
  type BoxProps,
  Flex,
  Stack,
  Switch,
  Text,
  Title,
} from "metabase/ui";

import {
  SETTINGS_CARD_DESCRIPTION_PROPS,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsSection,
} from "./SettingsSection";
import S from "./SettingsSection.module.css";

type SwitchSettingsSectionProps = {
  title: string;
  description: React.ReactNode;
  note?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  // locks only the switch and keeps it focusable, so focus survives a write
  switchDisabled?: boolean;
  lockedEnvName?: string;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
} & BoxProps;

/** A settings card whose title doubles as the label of a switch, revealing its children while on */
export function SwitchSettingsSection({
  title,
  description,
  note,
  checked,
  disabled = false,
  switchDisabled = false,
  lockedEnvName,
  onChange,
  children,
  ...boxProps
}: SwitchSettingsSectionProps) {
  const inputId = useId();
  const descriptionId = useId();
  const isSwitchLocked = switchDisabled || lockedEnvName != null;

  const handleChange = (nextChecked: boolean) => {
    if (isSwitchLocked) {
      return;
    }
    onChange(nextChecked);
  };

  // Enter would otherwise submit the page form the card sits in
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };

  return (
    <SettingsSection
      stackProps={SETTINGS_CARD_STACK_PROPS}
      disabled={disabled}
      {...boxProps}
    >
      <Flex justify="space-between" align="flex-start" gap="lg">
        <Box>
          <Title {...SETTINGS_CARD_TITLE_PROPS}>
            <Text
              component="label"
              htmlFor={inputId}
              className={disabled || isSwitchLocked ? undefined : S.TitleLabel}
              inherit
            >
              {title}
            </Text>
          </Title>
          <Box id={descriptionId}>
            <Text c="text-secondary" {...SETTINGS_CARD_DESCRIPTION_PROPS}>
              {description}
            </Text>
            {lockedEnvName != null && (
              <Text
                c="text-secondary"
                mt="sm"
              >{t`Using ${lockedEnvName}`}</Text>
            )}
            {note && (
              <Text c="text-secondary" mt="sm">
                {note}
              </Text>
            )}
          </Box>
        </Box>
        <Switch
          id={inputId}
          aria-describedby={descriptionId}
          checked={checked}
          disabled={disabled}
          aria-disabled={isSwitchLocked || undefined}
          onChange={(event) => handleChange(event.currentTarget.checked)}
          onKeyDown={handleKeyDown}
        />
      </Flex>
      {checked && !disabled && children && <Stack gap="lg">{children}</Stack>}
    </SettingsSection>
  );
}
