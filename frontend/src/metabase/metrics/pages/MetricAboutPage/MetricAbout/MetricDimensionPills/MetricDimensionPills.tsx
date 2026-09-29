import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./MetricDimensionPills.module.css";

export type MetricDimensionPillsProps = {
  options: readonly { value: string; label: string; icon: IconName }[];
  value: string | null;
  onChange: (value: string) => void;
  onShowMore?: () => void;
};

export function MetricDimensionPills({
  options,
  value,
  onChange,
  onShowMore,
}: MetricDimensionPillsProps) {
  return (
    <Group
      gap="xs"
      p="md"
      className={S.pills}
      role="group"
      aria-label={t`Break out by`}
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <Button
            key={option.value}
            radius="xl"
            size="compact-sm"
            variant={isActive ? "filled" : "default"}
            leftSection={<Icon name={option.icon} size={12} />}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
      {onShowMore && (
        <Button
          radius="xl"
          size="compact-sm"
          variant="subtle"
          leftSection={<Icon name="chevrondown" size={12} />}
          onClick={onShowMore}
        >
          {t`Show more`}
        </Button>
      )}
    </Group>
  );
}
