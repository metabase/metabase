import cx from "classnames";
import { t } from "ttag";

import {
  Badge,
  Checkbox,
  Group,
  Icon,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { MetricDimension } from "metabase-types/api";

import S from "./MetricDimensions.module.css";
import { getDimensionIcon, isOrphaned } from "./utils";

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
      data-testid={`dimension-row-${dimension.display_name}`}
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
          {dimension.default && <Badge variant="light">{t`Default`}</Badge>}
          {isOrphaned(dimension) && (
            <Icon
              name="warning"
              c="warning"
              tooltip={t`This column is no longer available in the metric's data`}
            />
          )}
          <Icon name="chevronright" c="text-secondary" />
        </Group>
      </UnstyledButton>
    </Group>
  );
}
