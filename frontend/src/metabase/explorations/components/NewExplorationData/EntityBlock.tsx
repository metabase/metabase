import { useMemo } from "react";
import { t } from "ttag";

import { getDimensionIcon } from "metabase/common/utils/columns";
import type { DimensionBlock, MetricBlock } from "metabase/explorations/hooks";
import {
  ActionIcon,
  Box,
  Ellipsified,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
import * as LibMetric from "metabase-lib/metric/core";
import type {
  DimensionId,
  ExplorationMetric,
  IconName,
  MetricDimension,
} from "metabase-types/api";

import S from "./NewExplorationData.module.css";
import { SelectedPills, TogglePill } from "./Pills";
import { formatDimensionLabel, groupDimensionsByGroupSource } from "./utils";

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
        <Group className={S.blockActions} wrap="nowrap" gap="xs">
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
  block: MetricBlock;
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
  const sections = useMemo(() => {
    const out: { label: string; dimensions: MetricDimension[] }[] = [];
    for (const row of groupDimensionsByGroupSource(block.dimensions)) {
      if (row.type === "header") {
        out.push({ label: row.label, dimensions: [] });
      } else {
        out[out.length - 1]?.dimensions.push(row.dimension);
      }
    }
    return out;
  }, [block.dimensions]);

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
        <Stack gap="md">
          <Text size="sm" c="text-secondary">
            {t`Modify which dimensions to see this metric by`}
          </Text>
          {sections.map((section) => (
            <Stack key={section.label} gap="sm">
              <Text size="sm" c="text-secondary">
                {section.label}
              </Text>
              <Group align="center" gap="sm" wrap="wrap">
                {section.dimensions.map((dimension) => (
                  <TogglePill
                    key={dimension.id}
                    label={dimension.display_name ?? dimension.id}
                    selected={block.selectedDimensionIds.has(dimension.id)}
                    disabled={disabled}
                    interestingness={dimension.dimension_interestingness}
                    onToggle={() => onToggleDimension(dimension.id)}
                  />
                ))}
              </Group>
            </Stack>
          ))}
        </Stack>
      ) : (
        <SelectedPills pills={selectedPills} />
      )}
    </EntityBlock>
  );
}

interface DimensionBlockItemProps {
  block: DimensionBlock;
  expanded: boolean;
  disabled: boolean;
  onToggleExpand: () => void;
  onRemoveBlock: () => void;
  onToggleMetric: (metricId: ExplorationMetric["id"]) => void;
}

export function DimensionBlockItem({
  block,
  expanded,
  disabled,
  onToggleExpand,
  onRemoveBlock,
  onToggleMetric,
}: DimensionBlockItemProps) {
  const iconName = getDimensionIcon(
    LibMetric.fromMetricDimension(block.dimension),
  );
  const selectedPills = block.metrics
    .filter((m) => block.selectedMetricIds.has(m.id))
    .map((m) => ({ label: m.name }));

  return (
    <EntityBlock
      iconName={iconName}
      iconLabel={t`Dimension`}
      title={formatDimensionLabel(block.dimension)}
      expanded={expanded}
      disabled={disabled}
      onToggleExpand={onToggleExpand}
      onRemoveBlock={onRemoveBlock}
    >
      {expanded ? (
        <Stack gap="md">
          <Text size="sm" c="text-secondary">
            {t`Modify which metrics to look at for this dimension`}
          </Text>
          {block.metrics.length === 0 ? (
            <Text size="sm" c="text-secondary">
              {t`No related metrics.`}
            </Text>
          ) : (
            <Group align="center" gap="sm" wrap="wrap">
              {block.metrics.map((metric) => (
                <TogglePill
                  key={metric.id}
                  label={metric.name}
                  selected={block.selectedMetricIds.has(metric.id)}
                  disabled={disabled}
                  onToggle={() => onToggleMetric(metric.id)}
                />
              ))}
            </Group>
          )}
        </Stack>
      ) : (
        <SelectedPills pills={selectedPills} />
      )}
    </EntityBlock>
  );
}
