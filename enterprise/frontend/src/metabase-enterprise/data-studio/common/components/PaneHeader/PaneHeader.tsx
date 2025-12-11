import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import type { GroupProps, IconName } from "metabase/ui";
import { Box, Button, FixedSizeIcon, Group, Stack, Tooltip } from "metabase/ui";

import S from "./PaneHeader.module.css";
import type { PaneHeaderTab } from "./types";

interface PaneHeaderProps extends Omit<GroupProps, "title"> {
  title: ReactNode;
  icon?: IconName;
  menu?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}

export const PaneHeader = ({
  className,
  title,
  icon,
  menu,
  tabs,
  actions,
  breadcrumbs,
  ...rest
}: PaneHeaderProps) => {
  return (
    <Group
      className={cx(S.header, className)}
      px="lg"
      py="md"
      justify="space-between"
      gap="sm"
      wrap="nowrap"
      {...rest}
    >
      <Stack gap="sm">
        {breadcrumbs && (
          <Box mb="lg" mt="sm">
            {breadcrumbs}
          </Box>
        )}
        <Group align="center" gap="xs" wrap="nowrap">
          {icon && <FixedSizeIcon name={icon} c="brand" size={20} />}
          {title}
          {menu}
        </Group>
        {tabs}
      </Stack>
      {actions}
    </Group>
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
      px={isOptional ? "xs" : undefined}
      bd={isOptional ? "1px solid var(--mb-color-border)" : undefined}
      isOptional={isOptional}
      data-testid={dataTestId}
      onChange={onChange}
      onContentChange={onContentChange}
    />
  );
}

type PaneHeaderTabsProps = {
  tabs: PaneHeaderTab[];
  withBackground?: boolean;
};

export function PaneHeaderTabs({ tabs, withBackground }: PaneHeaderTabsProps) {
  const { pathname } = useSelector(getLocation);
  const backgroundColor = withBackground ? "bg-secondary" : "transparent";

  return (
    <Group gap="sm">
      {tabs.map(({ label, to, icon, isSelected = to === pathname }) => {
        return (
          <Button
            key={label}
            component={Link}
            to={to}
            size="sm"
            radius="xl"
            c={isSelected ? "brand" : undefined}
            bg={isSelected ? "brand-light" : backgroundColor}
            bd="none"
            leftSection={icon != null ? <FixedSizeIcon name={icon} /> : null}
          >
            {label}
          </Button>
        );
      })}
    </Group>
  );
}

type PaneHeaderActionsProps = {
  errorMessage?: string;
  isValid?: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function PaneHeaderActions({
  errorMessage,
  isValid = true,
  isDirty = false,
  isSaving = false,
  onSave,
  onCancel,
}: PaneHeaderActionsProps) {
  const canSave = isDirty && !isSaving && isValid;

  if (!isDirty && !isSaving) {
    return null;
  }

  return (
    <Group>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Tooltip label={errorMessage} disabled={errorMessage == null}>
        <Button variant="filled" disabled={!canSave} onClick={onSave}>
          {t`Save`}
        </Button>
      </Tooltip>
    </Group>
  );
}
