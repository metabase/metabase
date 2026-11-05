import { t } from "ttag";

import type { ExplorationBlock } from "metabase/explorations/hooks";
import {
  ActionIcon,
  Box,
  Ellipsified,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
import type { DimensionId, IconName } from "metabase-types/api";

import S from "./NewExplorationData.module.css";
import { SelectedPills, TogglePill } from "./Pills";
import { formatDimensionLabel } from "./utils";

interface EntityBlockProps {
  iconName: IconName;
  iconLabel: string;
  title: string;
  expanded: boolean;
  disabled: boolean;
  onToggleExpand: () => void;
  onRemoveBlock: () => void;
  children: React.ReactNode;
}

export function EntityBlock({
  iconName,
  iconLabel,
  title,
  expanded,
  disabled,
  onToggleExpand,
  onRemoveBlock,
  children,
}: EntityBlockProps) {
  return (
    <Box className={S.block} data-expanded={expanded || undefined}>
      <Group
        className={S.blockHeader}
        wrap="nowrap"
        gap="sm"
        onClick={onToggleExpand}
      >
        <Icon
          name={iconName}
          size={14}
          c="text-secondary"
          tooltip={iconLabel}
          aria-label={iconLabel}
        />
        <Ellipsified flex={1} fw="bold">
          {title}
        </Ellipsified>
        <Group className={S.blockActions} wrap="nowrap" gap="xxs">
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
            aria-label={expanded ? t`Collapse` : t`Expand`}
          >
            <Icon name={expanded ? "chevronup" : "chevrondown"} size={14} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onRemoveBlock();
            }}
            aria-label={t`Remove area`}
          >
            <Icon name="close" size={12} />
          </ActionIcon>
        </Group>
      </Group>
      <Box
        className={S.blockBody}
        onClick={expanded ? undefined : onToggleExpand}
      >
        {children}
      </Box>
    </Box>
  );
}

interface MetricBlockItemProps {
  block: ExplorationBlock;
  expanded: boolean;
  disabled: boolean;
  onToggleExpand: () => void;
  onRemoveBlock: () => void;
  onToggleDimension: (dimensionId: DimensionId) => void;
}

export function MetricBlockItem({
  block,
  expanded,
  disabled,
  onToggleExpand,
  onRemoveBlock,
  onToggleDimension,
}: MetricBlockItemProps) {
  const selectedPills = block.dimensions
    .filter((d) => block.selectedDimensionIds.has(d.id))
    .map((d) => ({
      label: formatDimensionLabel(d),
      interestingness: d.dimension_interestingness,
    }));

  return (
    <EntityBlock
      iconName="metric"
      iconLabel={t`Metric`}
      title={block.metric.name}
      expanded={expanded}
      disabled={disabled}
      onToggleExpand={onToggleExpand}
      onRemoveBlock={onRemoveBlock}
    >
      {expanded ? (
        <Stack gap="lg">
          <Text size="sm" c="text-secondary">
            {t`Modify which dimensions to see this metric by`}
          </Text>
          <Group align="center" gap="sm" wrap="wrap">
            {block.dimensions.map((dimension) => (
              <TogglePill
                key={dimension.id}
                label={formatDimensionLabel(dimension)}
                selected={block.selectedDimensionIds.has(dimension.id)}
                disabled={disabled}
                interestingness={dimension.dimension_interestingness}
                onToggle={() => onToggleDimension(dimension.id)}
              />
            ))}
          </Group>
        </Stack>
      ) : (
        <SelectedPills pills={selectedPills} />
      )}
    </EntityBlock>
  );
}
