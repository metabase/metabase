import cx from "classnames";
import { t } from "ttag";

import { Sortable } from "metabase/common/components/Sortable";
import { getDimensionIcon } from "metabase/common/metrics/utils/dimensions";
import {
  Badge,
  Box,
  Checkbox,
  Group,
  Icon,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { MetricDimension } from "metabase-types/api";

import S from "./MetricDimensions.module.css";
import { isOrphaned } from "./utils";

interface DimensionRowProps {
  dimension: MetricDimension;
  checked: boolean;
  active: boolean;
  canReorder: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
}

export function DimensionRow({
  dimension,
  checked,
  active,
  canReorder,
  onToggle,
  onEdit,
}: DimensionRowProps) {
  return (
    <Sortable
      id={dimension.id}
      disabled={!canReorder}
      draggingStyle={{ opacity: 0.5 }}
      role="listitem"
    >
      {({ dragHandleRef, dragHandleListeners }) => (
        <Group
          gap="sm"
          wrap="nowrap"
          className={cx(S.row, { [S.rowActive]: active })}
          data-testid={`dimension-row-${dimension.display_name}`}
        >
          {canReorder && (
            <Box
              component="span"
              ref={dragHandleRef}
              className={S.grabber}
              data-testid="dimension-drag-handle"
              {...dragHandleListeners}
            >
              <Icon name="grabber" c="text-secondary" />
            </Box>
          )}
          <Checkbox
            aria-label={dimension.display_name}
            checked={checked}
            size="xs"
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
              <Icon name="chevronright" c="text-secondary" size={12} />
            </Group>
          </UnstyledButton>
        </Group>
      )}
    </Sortable>
  );
}
