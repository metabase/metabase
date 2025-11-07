import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import type { GroupProps, IconName } from "metabase/ui";
import { Box, Button, Group, Icon, Stack, Tooltip } from "metabase/ui";

import S from "./PaneHeader.module.css";
import type { PaneHeaderTab } from "./types";

interface PaneHeaderProps extends Omit<GroupProps, "title"> {
  title: ReactNode;
  icon?: IconName;
  badge?: ReactNode;
  menu?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
}

export const PaneHeader = ({
  className,
  title,
  icon,
  badge,
  menu,
  tabs,
  actions,
  ...rest
}: PaneHeaderProps) => {
  return (
    <Group
      className={cx(S.header, className)}
      p="md"
      justify="space-between"
      gap="sm"
      wrap="nowrap"
      {...rest}
    >
      <Stack gap="sm">
        <Group align="center" gap="xs" wrap="nowrap">
          {icon && <Icon name={icon} c="brand" size={20} />}
          {title}
          {badge}
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
  maxLength?: number;
  onChange?: (value: string) => void;
};

export function PaneHeaderInput({
  initialValue,
  maxLength,
  onChange,
}: PaneHeaderInputProps) {
  return (
    <EditableText
      initialValue={initialValue}
      maxLength={maxLength}
      placeholder={t`Name`}
      p={0}
      fw="bold"
      fz="h3"
      lh="h3"
      onChange={onChange}
    />
  );
}

type PaneHeaderTabsProps = {
  tabs: PaneHeaderTab[];
};

export function PaneHeaderTabs({ tabs }: PaneHeaderTabsProps) {
  const location = useSelector(getLocation);

  return (
    <Group gap="sm">
      {tabs.map(({ label, to }) => {
        const isSelected = to === location.pathname;

        return (
          <Button
            key={label}
            component={Link}
            to={to}
            size="sm"
            radius="xl"
            c={isSelected ? "brand" : undefined}
            bg={isSelected ? "brand-light" : "transparent"}
            bd="none"
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
