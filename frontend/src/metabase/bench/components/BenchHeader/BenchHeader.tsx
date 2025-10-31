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

import S from "./BenchHeader.module.css";

interface BenchHeaderProps {
  title: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
}

export const BenchHeader = ({ title, tabs, actions }: BenchHeaderProps) => {
  return (
    <Stack className={S.header} p="md" gap="sm">
      <Group justify="space-between" align="center">
        {title}
        {actions}
      </Group>
      {tabs}
    </Stack>
  );
};

type BenchHeaderInputProps = {
  initialValue?: string;
  maxLength?: number;
  onChange?: (value: string) => void;
};

export function BenchHeaderInput({
  initialValue,
  maxLength,
  onChange,
}: BenchHeaderInputProps) {
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

export type BenchHeaderTab = {
  label: string;
  to: string;
  icon: IconName;
  isSelected: boolean;
};

type BenchHeaderTabsProps = {
  tabs: BenchHeaderTab[];
};

export function BenchHeaderTabs({ tabs }: BenchHeaderTabsProps) {
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
