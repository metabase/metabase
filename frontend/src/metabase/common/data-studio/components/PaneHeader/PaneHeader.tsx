import type { ReactNode } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import {
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  type StackProps,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./PaneHeader.module.css";

export interface PaneHeaderProps extends Omit<StackProps, "title"> {
  title?: ReactNode;
  icon?: IconName;
  menu?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  breadcrumbs: ReactNode;
  showAppSwitcher?: boolean;
  /** PROTOTYPE: shown before the breadcrumbs, e.g. an open-nav button. */
  breadcrumbsLeading?: ReactNode;
  /**
   * PROTOTYPE: centers the breadcrumbs on the main nav's 52px header beside
   * the page ("Modern nav" variants), keeping the title where it was.
   */
  isBreadcrumbsAlignedWithNavHeader?: boolean;
}

export const PaneHeader = ({
  className,
  title,
  icon,
  menu,
  tabs,
  actions,
  breadcrumbs,
  showAppSwitcher = true,
  breadcrumbsLeading,
  isBreadcrumbsAlignedWithNavHeader = false,
  ...rest
}: PaneHeaderProps) => {
  return (
    <Stack gap={0} pt="xxs" {...rest}>
      <Flex
        // Aligned: 4px + 6px + half the 32px row = 26px, the nav header's
        // center; the 10px taken from above goes below, so the title stays.
        mt={isBreadcrumbsAlignedWithNavHeader ? 6 : "lg"}
        mb={
          isBreadcrumbsAlignedWithNavHeader
            ? "calc(var(--mantine-spacing-xl) + 10px)"
            : "xl"
        }
        w="100%"
        h="xxl"
        pos="relative"
      >
        {/* Hangs in the margin left of the breadcrumbs, so they stay lined
            up with the title whether or not it's there. */}
        {breadcrumbsLeading && (
          <Box
            pos="absolute"
            right="100%"
            mr="sm"
            top="50%"
            style={{ transform: "translateY(-50%)" }}
          >
            {breadcrumbsLeading}
          </Box>
        )}
        {breadcrumbs}

        <Group ml="auto" gap="lg" className={S.ButtonGroup}>
          {showAppSwitcher && <AppSwitcher />}
        </Group>
      </Flex>
      <Group
        className={className}
        gap="sm"
        justify="space-between"
        align="flex-start"
        wrap="nowrap"
      >
        <Stack gap="lg">
          {title && (
            <Group align="center" gap="sm" wrap="nowrap">
              {icon && <FixedSizeIcon name={icon} c="core-brand" size={20} />}
              {title}
              {menu && (
                // The menu button is taller than the title, keep it from growing the header
                <Flex h="var(--mantine-h3-line-height)" align="center">
                  {menu}
                </Flex>
              )}
            </Group>
          )}
          {tabs}
        </Stack>
        {actions}
      </Group>
    </Stack>
  );
};

type PaneHeaderTitleProps = {
  children?: ReactNode;
};

export function PanelHeaderTitle({ children }: PaneHeaderTitleProps) {
  return (
    <Box fw="bold" fz="h3" lh="h3">
      {children}
    </Box>
  );
}

type PaneHeaderInputProps = {
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  isOptional?: boolean;
  readOnly?: boolean;
  "data-testid"?: string;
  onChange?: (value: string) => void;
  onContentChange?: (value: string) => void;
};

export function PaneHeaderInput({
  initialValue,
  placeholder = t`Name`,
  maxLength,
  "data-testid": dataTestId,
  isOptional,
  readOnly = false,
  onChange,
  onContentChange,
}: PaneHeaderInputProps) {
  return (
    <EditableText
      initialValue={initialValue}
      placeholder={placeholder}
      maxLength={maxLength}
      p={0}
      fw="bold"
      fz="h3"
      lh="h3"
      px={isOptional ? "xxs" : undefined}
      bd={isOptional ? "1px solid var(--mb-color-border-neutral)" : undefined}
      isOptional={isOptional}
      isDisabled={readOnly}
      data-testid={dataTestId}
      onChange={onChange}
      onContentChange={onContentChange}
    />
  );
}

type PaneHeaderActionsProps = {
  errorMessage?: string;
  isValid?: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  alwaysVisible?: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function PaneHeaderActions({
  errorMessage,
  isValid = true,
  isDirty = false,
  isSaving = false,
  alwaysVisible = false,
  onSave,
  onCancel,
}: PaneHeaderActionsProps) {
  const canSave = isDirty && !isSaving && isValid;

  if (!isDirty && !isSaving && !alwaysVisible) {
    return null;
  }

  return (
    <Group wrap="nowrap">
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Tooltip label={errorMessage} disabled={errorMessage == null}>
        <Button variant="filled" disabled={!canSave} onClick={onSave}>
          {t`Save`}
        </Button>
      </Tooltip>
    </Group>
  );
}
