import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import {
  Button,
  FixedSizeIcon,
  Group,
  type IconName,
  Stack,
} from "metabase/ui";

import S from "./PaneHeader.module.css";

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

export type PaneHeaderTab = {
  label: string;
  to: string;
  icon: IconName;
  isSelected: boolean;
};

type PaneHeaderTabsProps = {
  tabs: PaneHeaderTab[];
};

export function PaneHeaderTabs({ tabs }: PaneHeaderTabsProps) {
  return (
    <Group gap="sm">
      {tabs.map(({ label, to, icon, isSelected }) => (
        <Button
          key={label}
          component={Link}
          to={to}
          size="sm"
          radius="xl"
          c={isSelected ? "brand" : undefined}
          bg={isSelected ? "brand-light" : undefined}
          bd="none"
          leftSection={
            <FixedSizeIcon name={icon} opacity={isSelected ? 1 : 0.6} />
          }
        >
          {label}
        </Button>
      ))}
    </Group>
  );
}
