import cx from "classnames";
import type React from "react";

import {
  Accordion,
  Box,
  type BoxProps,
  Icon,
  Stack,
  type StackProps,
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
  mt: "xs",
};
export const SETTINGS_CARD_STACK_PROPS: StackProps = { gap: "md" };

export function SettingsSection({
  title,
  titleProps,
  description,
  descriptionProps,
  children,
  id,
  stackProps,
  ...boxProps
}: {
  title?: React.ReactNode;
  titleProps?: TitleProps;
  description?: React.ReactNode;
  descriptionProps?: TextProps;
  children?: React.ReactNode;
  id?: string;
  stackProps?: StackProps;
} & BoxProps) {
  const { className: stackClassName, ...restStackProps } = stackProps ?? {};
  return (
    <Box id={id} {...boxProps}>
      {children && (
        <Stack
          gap="lg"
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

const COLLAPSIBLE_SECTION_VALUE = "section";

export function CollapsibleSettingsSection({
  title,
  description,
  defaultOpened = false,
  children,
  className,
  ...boxProps
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultOpened?: boolean;
  children?: React.ReactNode;
} & BoxProps) {
  return (
    <Accordion
      className={cx(S.CollapsibleAccordion, className)}
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
      defaultValue={defaultOpened ? COLLAPSIBLE_SECTION_VALUE : null}
      {...boxProps}
    >
      <Accordion.Item value={COLLAPSIBLE_SECTION_VALUE}>
        {/* the header wrapper anchors the control's stretched hit area, so
            the whole header row toggles while the description stays outside
            the control button and out of its accessible name */}
        <Box className={S.CollapsibleHeader}>
          <Accordion.Control>{title}</Accordion.Control>
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
    <Stack gap="lg" {...stackProps}>
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
