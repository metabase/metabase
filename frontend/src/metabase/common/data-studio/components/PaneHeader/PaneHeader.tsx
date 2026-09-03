import type { ReactNode } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { MetabotDataStudioButton } from "metabase/metabot/components/MetabotDataStudioButton";
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
  showMetabotButton?: boolean;
  showAppSwitcher?: boolean;
}

export const PaneHeader = ({
  className,
  title,
  icon,
  menu,
  tabs,
  actions,
  breadcrumbs,
  showMetabotButton,
  showAppSwitcher = true,
  ...rest
}: PaneHeaderProps) => {
  return (
    <Stack gap={0} pt="xxs" {...rest}>
      <Flex mb="xl" mt="lg" w="100%" h="xxl">
        {breadcrumbs}

        <Group ms="auto" gap="lg" className={S.ButtonGroup}>
          {showMetabotButton && <MetabotDataStudioButton />}
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
              {menu}
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
