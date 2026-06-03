import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { getDimensionIcon } from "metabase/common/utils/columns";
import { trackExplorationCreated } from "metabase/explorations/analytics";
import type {
  DimensionBlock,
  ExplorationBlock,
  ExplorationSelection,
  MetricBlock,
} from "metabase/explorations/hooks";
import { isMetricBlock } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Ellipsified,
  Group,
  Icon,
  Menu,
  Pill,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as LibMetric from "metabase-lib/metric/core";
import type {
  CreateExplorationRequest,
  DimensionId,
  IconName,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

import { EXPLORATIONS_AGENT_ID } from "../NewExplorationChat/NewExplorationChat";

import S from "./NewExplorationData.module.css";
import { ResearchModeIntro } from "./ResearchModeIntro";
import {
  AddDimensionsModal,
  AddMetricsModal,
  AddTimelinesModal,
} from "./modals";
import { groupDimensionsByGroupSource } from "./utils";

/** How many selected pills to show on a collapsed block before "+N". */
const COLLAPSED_PILL_LIMIT = 3;

type ActiveModal = "metrics" | "dimensions" | "events" | null;

export interface NewExplorationDataProps {
  selection: ExplorationSelection;
}

function metricToSelection(m: ExplorationMetric) {
  return {
    card_id: m.id,
    dimension_mappings: m.dimension_mappings,
  };
}

function dimensionToSelection(d: MetricDimension) {
  return {
    dimension_id: d.id,
    display_name: d.display_name,
    effective_type: d.effective_type,
    semantic_type: d.semantic_type,
  };
}

function blockToGroup(block: ExplorationBlock) {
  if (isMetricBlock(block)) {
    return {
      metrics: [metricToSelection(block.metric)],
      dimensions: block.dimensions
        .filter((d) => block.selectedDimensionIds.has(d.id))
        .map(dimensionToSelection),
      timeline_ids: [] as number[],
    };
  }
  return {
    metrics: block.metrics
      .filter((m) => block.selectedMetricIds.has(m.id))
      .map(metricToSelection),
    dimensions: block.groupDimensions.map(dimensionToSelection),
    timeline_ids: [] as number[],
  };
}

export function buildCreateExplorationRequest(
  name: string,
  prompt: string,
  blocks: ExplorationBlock[],
  timelines: Timeline[],
): CreateExplorationRequest {
  const trimmedPrompt = prompt.trim();

  const timelineIds = timelines.map((tl) => tl.id);
  const groups = blocks.map((block) => ({
    ...blockToGroup(block),
    timeline_ids: timelineIds,
  }));

  return {
    name,
    prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
    groups,
  };
}

export function NewExplorationData({ selection }: NewExplorationDataProps) {
  const {
    blocks,
    timelines,
    name,
    removeBlock,
    toggleDimensionSelected,
    toggleMetricSelected,
    toggleTimeline,
  } = selection;
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  // Blocks are expanded by default; track only the ones the user collapsed.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const [createExploration, { isLoading: isStarting }] =
    useCreateExplorationMutation();

  const { messages } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  const isExpanded = useCallback(
    (blockId: string) => !collapsedIds.has(blockId),
    [collapsedIds],
  );
  const toggleExpanded = useCallback((blockId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    const prompt = messages
      .filter((message) => message.role === "user")
      .map((message) => message.message)
      .join("\n---\n");
    const request = buildCreateExplorationRequest(
      name,
      prompt,
      blocks,
      timelines,
    );
    try {
      const exploration = await createExploration(request).unwrap();
      trackExplorationCreated(exploration.id);
      dispatch(push(Urls.exploration(exploration.id)));
    } catch (error) {
      console.error(error);
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to start research`,
      });
    }
  }, [
    createExploration,
    dispatch,
    messages,
    blocks,
    timelines,
    name,
    sendToast,
  ]);

  const canStart = blocks.length > 0;

  return (
    <Stack
      className={S.container}
      data-testid="research-content"
      gap={0}
      bg="background-primary"
      flex={1}
      px="sm"
      py="md"
      h="100%"
      w="100%"
    >
      <Group justify="space-between" align="center" px="md" flex="none">
        <Title order={4} fs="1rem" lh={1.5}>{t`Research plan`}</Title>
        <Group gap="xs">
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<Icon name="add" size={12} />}
            onClick={() => setActiveModal("events")}
          >{t`Events`}</Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button
                variant="subtle"
                size="compact-sm"
                leftSection={<Icon name="add" size={12} />}
              >{t`Data`}</Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => setActiveModal("metrics")}>
                {t`Metrics`}
              </Menu.Item>
              <Menu.Item onClick={() => setActiveModal("dimensions")}>
                {t`Dimensions`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <Box flex={1} mih={0} p="md" style={{ overflowY: "auto" }}>
        {blocks.length === 0 ? (
          <ResearchPlanEmptyState />
        ) : (
          <Stack gap="md">
            {blocks.map((block) =>
              isMetricBlock(block) ? (
                <MetricBlockItem
                  key={block.id}
                  block={block}
                  expanded={isExpanded(block.id)}
                  onToggleExpand={() => toggleExpanded(block.id)}
                  onRemoveBlock={() => removeBlock(block.id)}
                  onToggleDimension={(dimensionId) =>
                    toggleDimensionSelected(block.id, dimensionId)
                  }
                />
              ) : (
                <DimensionBlockItem
                  key={block.id}
                  block={block}
                  expanded={isExpanded(block.id)}
                  onToggleExpand={() => toggleExpanded(block.id)}
                  onRemoveBlock={() => removeBlock(block.id)}
                  onToggleMetric={(metricId) =>
                    toggleMetricSelected(block.id, metricId)
                  }
                />
              ),
            )}
          </Stack>
        )}
      </Box>

      <SelectedTimelinesPanel
        timelines={timelines}
        onRemoveTimeline={toggleTimeline}
      />

      {canStart && (
        <Button
          className={S.beginButton}
          flex="none"
          size="sm"
          w="100%"
          maw="25rem"
          mx="2rem"
          mt="md"
          variant="filled"
          loading={isStarting}
          disabled={isStarting}
          onClick={handleStart}
        >{t`Start research`}</Button>
      )}

      <AddMetricsModal
        opened={activeModal === "metrics"}
        onClose={() => setActiveModal(null)}
        selection={selection}
      />
      <AddDimensionsModal
        opened={activeModal === "dimensions"}
        onClose={() => setActiveModal(null)}
        selection={selection}
      />
      <AddTimelinesModal
        opened={activeModal === "events"}
        onClose={() => setActiveModal(null)}
        selection={selection}
      />
    </Stack>
  );
}

function ResearchPlanEmptyState() {
  return (
    <Center h="100%">
      <ResearchModeIntro />
    </Center>
  );
}

interface BlockShellProps {
  iconName: IconName;
  iconLabel: string;
  title: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemoveBlock: () => void;
  children: React.ReactNode;
}

function BlockShell({
  iconName,
  iconLabel,
  title,
  expanded,
  onToggleExpand,
  onRemoveBlock,
  children,
}: BlockShellProps) {
  return (
    <Box className={S.block} data-expanded={expanded || undefined}>
      <Group className={S.blockHeader} wrap="nowrap" gap="sm">
        <Icon
          name={iconName}
          size={14}
          c="text-secondary"
          aria-label={iconLabel}
        />
        <Ellipsified flex={1} fw="bold">
          {title}
        </Ellipsified>
        <Group className={S.blockActions} wrap="nowrap" gap="xs">
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={onToggleExpand}
            aria-label={expanded ? t`Collapse` : t`Expand`}
          >
            <Icon name={expanded ? "chevronup" : "chevrondown"} size={14} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={onRemoveBlock}
            aria-label={t`Remove area`}
          >
            <Icon name="close" size={12} />
          </ActionIcon>
        </Group>
      </Group>
      <Box className={S.blockBody}>{children}</Box>
    </Box>
  );
}

interface SelectedPillsProps {
  labels: string[];
}

/** Collapsed view: plain, non-removable pills for the selected children. */
function SelectedPills({ labels }: SelectedPillsProps) {
  if (labels.length === 0) {
    return (
      <Text size="sm" c="text-secondary">
        {t`Nothing selected`}
      </Text>
    );
  }
  const shown = labels.slice(0, COLLAPSED_PILL_LIMIT);
  const overflow = labels.length - shown.length;
  return (
    <Group align="center" gap="sm" wrap="wrap">
      {shown.map((label, index) => (
        <PillItem key={`${label}-${index}`} label={label} />
      ))}
      {overflow > 0 && <PillItem label={`+${overflow}`} isOverflow />}
    </Group>
  );
}

interface MetricBlockItemProps {
  block: MetricBlock;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemoveBlock: () => void;
  onToggleDimension: (dimensionId: DimensionId) => void;
}

function MetricBlockItem({
  block,
  expanded,
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

  const selectedLabels = block.dimensions
    .filter((d) => block.selectedDimensionIds.has(d.id))
    .map(formatDimensionLabel);

  return (
    <BlockShell
      iconName="metric"
      iconLabel={t`Metric`}
      title={block.metric.name}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      onRemoveBlock={onRemoveBlock}
    >
      {expanded ? (
        <Stack gap="md">
          {sections.map((section) => (
            <Stack key={section.label} gap="xs">
              <Text size="xs" c="text-secondary">
                {section.label}
              </Text>
              <Group align="center" gap="sm" wrap="wrap">
                {section.dimensions.map((dimension) => (
                  <TogglePill
                    key={dimension.id}
                    label={dimension.display_name ?? dimension.id}
                    selected={block.selectedDimensionIds.has(dimension.id)}
                    onToggle={() => onToggleDimension(dimension.id)}
                  />
                ))}
              </Group>
            </Stack>
          ))}
        </Stack>
      ) : (
        <SelectedPills labels={selectedLabels} />
      )}
    </BlockShell>
  );
}

interface DimensionBlockItemProps {
  block: DimensionBlock;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemoveBlock: () => void;
  onToggleMetric: (metricId: ExplorationMetric["id"]) => void;
}

function DimensionBlockItem({
  block,
  expanded,
  onToggleExpand,
  onRemoveBlock,
  onToggleMetric,
}: DimensionBlockItemProps) {
  const iconName = getDimensionIcon(
    LibMetric.fromMetricDimension(block.dimension),
  );
  const selectedLabels = block.metrics
    .filter((m) => block.selectedMetricIds.has(m.id))
    .map((m) => m.name);

  return (
    <BlockShell
      iconName={iconName}
      iconLabel={t`Dimension`}
      title={formatDimensionLabel(block.dimension)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      onRemoveBlock={onRemoveBlock}
    >
      {expanded ? (
        <Stack gap="xs">
          <Text size="xs" c="text-secondary">{t`Metrics`}</Text>
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
                  onToggle={() => onToggleMetric(metric.id)}
                />
              ))}
            </Group>
          )}
        </Stack>
      ) : (
        <SelectedPills labels={selectedLabels} />
      )}
    </BlockShell>
  );
}

interface SelectedTimelinesPanelProps {
  timelines: Timeline[];
  onRemoveTimeline: (timeline: Timeline) => void;
}

function SelectedTimelinesPanel({
  timelines,
  onRemoveTimeline,
}: SelectedTimelinesPanelProps) {
  if (timelines.length === 0) {
    return null;
  }
  return (
    <Box flex="none" px="md" pt="md">
      <Text mb="xs">{t`Events`}</Text>
      <Group align="flex-start" gap="sm" wrap="wrap">
        {timelines.map((timeline) => (
          <PillItem
            key={timeline.id}
            label={timeline.name}
            onRemove={() => onRemoveTimeline(timeline)}
          />
        ))}
      </Group>
    </Box>
  );
}

interface PillItemProps {
  label: string;
  isOverflow?: boolean;
  onRemove?: () => void;
}

function PillItem({ label, isOverflow, onRemove }: PillItemProps) {
  return (
    <Pill
      withRemoveButton={onRemove != null}
      onRemove={onRemove}
      bdrs="xl"
      bg={isOverflow ? "background-secondary" : "background-primary"}
      bd="1px solid border"
      fw={600}
      py="0.375rem"
      px="sm"
      maw="100%"
      classNames={{ root: S.pill, remove: S.pillRemove, label: S.pillLabel }}
      removeButtonProps={
        onRemove != null
          ? { mr: 0, "aria-hidden": false, "aria-label": t`Remove` }
          : undefined
      }
    >
      <Ellipsified>{label}</Ellipsified>
    </Pill>
  );
}

interface TogglePillProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
}

function TogglePill({ label, selected, onToggle }: TogglePillProps) {
  return (
    <UnstyledButton
      className={cx(S.togglePill, { [S.togglePillSelected]: selected })}
      onClick={onToggle}
      aria-pressed={selected}
    >
      {selected && <Icon name="check" size={10} aria-hidden />}
      <Ellipsified>{label}</Ellipsified>
    </UnstyledButton>
  );
}

function formatDimensionLabel(dim: MetricDimension): string {
  const name = dim.display_name ?? dim.id;
  const tableName = dim.group?.display_name;
  return tableName ? `${tableName} - ${name}` : name;
}
