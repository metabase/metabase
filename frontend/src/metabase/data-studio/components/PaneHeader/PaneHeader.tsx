import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { Button, Group, Stack, Tooltip } from "metabase/ui";

import S from "./PaneHeader.module.css";
import type { PaneHeaderTab, PaneHeaderValidationResult } from "./types";

interface PaneHeaderProps {
  title: ReactNode;
  menu?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  "data-testid"?: string;
}

export const PaneHeader = ({
  title,
  menu,
  tabs,
  actions,
  "data-testid": dataTestId,
}: PaneHeaderProps) => {
  return (
    <Group
      className={S.header}
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
          bg={isSelected ? "brand-light" : undefined}
          bd="none"
        >
          {label}
        </Button>
      ))}
    </Group>
  );
}

type PaneHeaderActionsProps = {
  validationResult: PaneHeaderValidationResult;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function PaneHeaderActions({
  validationResult,
  isDirty,
  isSaving,
  onSave,
  onCancel,
}: PaneHeaderActionsProps) {
  const canSave = isDirty && !isSaving && validationResult.isValid;

  if (!isDirty) {
    return null;
  }

  return (
    <Group>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Tooltip
        label={validationResult.errorMessage}
        disabled={validationResult.errorMessage == null}
      >
        <Button variant="filled" disabled={!canSave} onClick={onSave}>
          {t`Save`}
        </Button>
      </Tooltip>
    </Group>
  );
}
