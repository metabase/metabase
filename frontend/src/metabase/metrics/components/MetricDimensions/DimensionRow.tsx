import cx from "classnames";

import { Checkbox, Group, Icon, Text, UnstyledButton } from "metabase/ui";
import type { MetricDimension } from "metabase-types/api";

import S from "./MetricDimensions.module.css";
import { getDimensionIcon } from "./utils";

interface DimensionRowProps {
  dimension: MetricDimension;
  checked: boolean;
  active: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
}

export function DimensionRow({
  dimension,
  checked,
  active,
  onToggle,
  onEdit,
}: DimensionRowProps) {
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      className={cx(S.row, { [S.rowActive]: active })}
    >
      <Checkbox
        aria-label={dimension.display_name}
        checked={checked}
        onChange={(event) => onToggle(event.currentTarget.checked)}
      />
      <UnstyledButton className={S.rowButton} onClick={onEdit}>
        <Group gap="sm" wrap="nowrap">
          <Icon name={getDimensionIcon(dimension)} c="text-secondary" />
          <Text flex={1} truncate="end">
            {dimension.display_name}
          </Text>
          <Icon name="chevronright" c="text-secondary" />
        </Group>
      </UnstyledButton>
    </Group>
  );
}
