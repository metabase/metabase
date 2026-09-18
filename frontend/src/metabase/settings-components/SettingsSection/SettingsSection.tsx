import cx from "classnames";
import type React from "react";
import { useId, useState } from "react";

import {
  Accordion,
  Box,
  type BoxProps,
  Flex,
  Icon,
  Stack,
  type StackProps,
  Switch,
  Text,
  type TextProps,
  Title,
  type TitleProps,
} from "metabase/ui";

import S from "./SettingsSection.module.css";

// Card titles render h4-sized but stay h2 so the page outline doesn't jump
// from the h1 page title to h4.
export const SETTINGS_CARD_TITLE_PROPS: TitleProps = { order: 2, size: "h4" };
export const SETTINGS_CARD_DESCRIPTION_PROPS: TextProps = {
  lh: "sm",
  mt: "xxs",
};
export const SETTINGS_CARD_STACK_PROPS: StackProps = { gap: "lg" };

export function SettingsSection({
  title,
  titleProps,
  description,
  descriptionProps,
  children,
  id,
  stackProps,
  disabled = false,
  className,
  ...boxProps
}: {
  title?: React.ReactNode;
  titleProps?: TitleProps;
  description?: React.ReactNode;
  descriptionProps?: TextProps;
  children?: React.ReactNode;
  id?: string;
  stackProps?: StackProps;
  // greys the whole card out; the caller still disables the controls inside
  disabled?: boolean;
} & BoxProps) {
  const { className: stackClassName, ...restStackProps } = stackProps ?? {};
  return (
    <Box
      id={id}
      className={cx(disabled && S.DisabledSection, className)}
      {...boxProps}
    >
      {children && (
        <Stack
          gap="xl"
          className={cx(S.SettingsSection, stackClassName)}
          {...restStackProps}
        >
          {(title || description) && (
            <Box mb="sm">
              {title && (
                <Title order={2} {...titleProps}>
                  {title}
                </Title>
              )}
              {description && (
                <Text c="text-secondary" {...descriptionProps}>
                  {description}
                </Text>
              )}
            </Box>
          )}
          {children}
        </Stack>
      )}
    </Box>
  );
}

type SwitchSettingsSectionProps = {
  title: string;
  description: React.ReactNode;
  // says why the switch cannot be toggled, already styled by the caller and rendered as given
  note?: React.ReactNode;
  checked: boolean;
  // greys the whole card, locks the switch and keeps the children hidden
  disabled?: boolean;
  // locks the switch alone, for instance while an env var owns the value
  switchDisabled?: boolean;
  // holds the switch while its write is in flight, staying focusable so a keyboard user keeps their place
  switchBusy?: boolean;
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
  switchBusy = false,
  onChange,
  children,
  ...boxProps
}: SwitchSettingsSectionProps) {
  const inputId = useId();
  const descriptionId = useId();
  const isSwitchLocked = disabled || switchDisabled;

  const handleChange = (nextChecked: boolean) => {
    // aria-disabled keeps the switch focusable, so it cannot block the event on its own
    if (switchBusy) {
      return;
    }
    onChange(nextChecked);
  };

  // the card sits inside a page form, so Enter must not reach its submit button
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
              className={cx(
                S.TitleLabel,
                (isSwitchLocked || switchBusy) && S.DisabledTitleLabel,
              )}
              inherit
            >
              {title}
            </Text>
          </Title>
          {/* the note lives inside the described region so assistive tech hears why the switch is locked */}
          <Box id={descriptionId}>
            <Text c="text-secondary" {...SETTINGS_CARD_DESCRIPTION_PROPS}>
              {description}
            </Text>
            {note}
          </Box>
        </Box>
        <Switch
          id={inputId}
          aria-describedby={descriptionId}
          checked={checked}
          disabled={isSwitchLocked}
          aria-disabled={switchBusy || undefined}
          classNames={
            switchBusy ? { root: S.BusySwitch, track: S.BusyTrack } : undefined
          }
          onChange={(event) => handleChange(event.currentTarget.checked)}
          onKeyDown={handleKeyDown}
        />
      </Flex>
      {checked && !disabled && children && <Stack gap="lg">{children}</Stack>}
    </SettingsSection>
  );
}

const COLLAPSIBLE_SECTION_VALUE = "section";

export function CollapsibleSettingsSection({
  title,
  description,
  defaultOpened = false,
  disabled = false,
  children,
  className,
  ...boxProps
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultOpened?: boolean;
  // greys the card out, keeps it closed and keeps it from toggling
  disabled?: boolean;
  children?: React.ReactNode;
} & BoxProps) {
  // a card that defaults open while disabled opens once it is enabled
  const [isOpened, setIsOpened] = useState(defaultOpened);
  return (
    <Accordion
      className={cx(
        S.CollapsibleAccordion,
        disabled && S.DisabledSection,
        className,
      )}
      classNames={{
        item: S.CollapsibleItem,
        control: S.CollapsibleControl,
        label: S.CollapsibleLabel,
        chevron: S.CollapsibleChevron,
        content: S.CollapsibleContent,
        panel: S.CollapsiblePanel,
      }}
      chevron={<Icon aria-hidden name="chevrondown" />}
      order={2}
      value={isOpened && !disabled ? COLLAPSIBLE_SECTION_VALUE : null}
      onChange={(value) => setIsOpened(value != null)}
      {...boxProps}
    >
      <Accordion.Item value={COLLAPSIBLE_SECTION_VALUE}>
        {/* the header wrapper anchors the control's stretched hit area, so
            the whole header row toggles while the description stays outside
            the control button and out of its accessible name */}
        <Box className={S.CollapsibleHeader}>
          <Accordion.Control disabled={disabled}>{title}</Accordion.Control>
          {description && (
            <Text c="text-secondary" {...SETTINGS_CARD_DESCRIPTION_PROPS}>
              {description}
            </Text>
          )}
        </Box>
        <Accordion.Panel>{children}</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

export function SettingsPageWrapper({
  title,
  description,
  descriptionProps,
  children,
  ...stackProps
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  descriptionProps?: TextProps;
  children: React.ReactNode;
} & Omit<StackProps, "title">) {
  return (
    <Stack gap="xl" {...stackProps}>
      {(title || description) && (
        <Stack gap="sm">
          {title && (
            <Title order={1} display="flex" className={S.PageTitle}>
              {title}
            </Title>
          )}
          {description && (
            <Text c="text-secondary" lh={1.5} maw="40rem" {...descriptionProps}>
              {description}
            </Text>
          )}
        </Stack>
      )}
      {children}
    </Stack>
  );
}
