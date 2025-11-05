import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { Button, Group, Stack, Tooltip } from "metabase/ui";

import S from "./PaneHeader.module.css";
import type { PaneHeaderTab } from "./types";

interface PaneHeaderProps {
  title: ReactNode;
  menu?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export const PaneHeader = ({
  title,
  menu,
  tabs,
  actions,
  className,
  "data-testid": dataTestId,
}: PaneHeaderProps) => {
  return (
    <Group
      className={cx(S.header, className)}
      p="md"
      justify="space-between"
      gap="sm"
      data-testid={dataTestId}
    >
      <Stack gap="sm">
        <Group align="center" gap="xs">
          {title}
          {menu}
        </Group>
        {tabs}
      </Stack>
      {actions}
    </Group>
  );
};

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
  return (
    <Group gap="sm">
      {tabs.map(({ label, to, isSelected }) => (
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
      ))}
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
