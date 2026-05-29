import { useDndContext, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type HTMLAttributes, useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type {
  DimensionBlock,
  ExplorationBlock,
  ExplorationDragData,
  ExplorationNavigation,
  ExplorationSelection,
  MetricBlock,
} from "metabase/explorations/hooks";
import {
  RESEARCH_PLAN_EMPTY_DROPPABLE_ID,
  RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID,
  RESEARCH_PLAN_TIMELINE_DROPPABLE_ID,
  isExplorationDropAccepted,
  isMetricBlock,
} from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { getDimensionIcon } from "metabase/metrics-viewer/utils/tabs";
import { useDispatch } from "metabase/redux";
import {
  Accordion,
  ActionIcon,
  Box,
  Button,
  Ellipsified,
  Group,
  Icon,
  Pill,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as LibMetric from "metabase-lib/metric/core";
import type {
  CreateExplorationRequest,
  DimensionId,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

import { EXPLORATIONS_AGENT_ID } from "../NewExplorationChat/NewExplorationChat";

import S from "./NewExplorationData.module.css";

export interface NewExplorationDataProps {
  selection: ExplorationSelection;
  navigation: ExplorationNavigation;
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

/**
 * Translate one Research plan block into a `CreateExplorationRequest`
 * group entry.
 *
 * - **Metric block** → group with `[block.metric]` and the block's
 *   own `dimensions`.
 * - **Dimension block** → group with `block.metrics` and the group's
 *   sibling dimensions (`groupDimensions`), preserving the picker-row
 *   semantics of "every dimension covered by this row".
 */
function blockToGroup(block: ExplorationBlock) {
  if (isMetricBlock(block)) {
    return {
      metrics: [metricToSelection(block.metric)],
      dimensions: block.dimensions.map(dimensionToSelection),
      timeline_ids: [] as number[],
    };
  }
  return {
    metrics: block.metrics.map(metricToSelection),
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

  // The timeline selection is exploration-wide, not per-block, so we
  // attach the same `timeline_ids` to every group the request carries.
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

export function NewExplorationData({
  selection,
  navigation,
}: NewExplorationDataProps) {
  const {
    blocks,
    timelines,
    name,
    removeBlock,
    removeDimensionFromMetricBlock,
    removeMetricFromDimensionBlock,
    toggleTimeline,
  } = selection;
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const [createExploration, { isLoading: isStarting }] =
    useCreateExplorationMutation();

  const { messages } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

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
      dispatch(push(Urls.exploration(exploration.id)));
    } catch (error) {
      console.error(error);
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to begin research`,
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

  const defaultExpandedIds = blocks.map((b) => b.id);

  /**
   * Empty-space clicks within this column should deselect the active
   * block. The page-level `useClickOutside` only fires when the click
   * lands outside the Research plan + Data palette columns — and the
   * user wants the column's own gutters/title/drop-zone areas to
   * deselect too. We detect "did the click land on a block?" via the
   * `data-block-id` attribute that `MetricBlockItem` /
   * `DimensionBlockItem` carry; if not, we clear. Block items don't
   * stopPropagation: their own `onActivate` runs first (React bubble
   * order), then this handler skips the clear because `closest()`
   * finds a `data-block-id` on the bubble path.
   */
  const handleBackgroundClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (navigation.activeBlockId == null) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-block-id]") != null) {
        return;
      }
      navigation.clearActiveBlock();
    },
    [navigation],
  );

  return (
    <Stack
      className={S.container}
      data-testid="research-content"
      gap={0}
      bg="background-secondary"
      flex={1}
      px="sm"
      py="md"
      h="100%"
      w="100%"
      onClick={handleBackgroundClick}
    >
      <Group justify="space-between" align="center" px="md" flex="none">
        <Title order={4} fs="1rem" lh={1.5}>{t`Research plan`}</Title>
      </Group>
      <Box flex={1} mih={0} p="md" style={{ overflowY: "auto" }}>
        {blocks.length === 0 ? (
          <ResearchPlanEmptyState
            onAddMetric={() => navigation.openBrowse("metrics")}
            onAddDimension={() => navigation.openBrowse("dimensions")}
          />
        ) : (
          <>
            <Accordion
              multiple
              defaultValue={defaultExpandedIds}
              chevronPosition="right"
              classNames={{
                root: S.accordionRoot,
                item: S.accordionItem,
                control: S.accordionControl,
                content: S.accordionContent,
                panel: S.accordionPanel,
                label: S.accordionLabel,
                chevron: S.accordionChevron,
              }}
            >
              {blocks.map((block) =>
                isMetricBlock(block) ? (
                  <MetricBlockItem
                    key={block.id}
                    block={block}
                    isActive={navigation.activeBlockId === block.id}
                    onActivate={() =>
                      navigation.selectBlock(block.id, "dimensions")
                    }
                    onRemoveBlock={() => removeBlock(block.id)}
                    onRemoveDimension={(dimensionId) =>
                      removeDimensionFromMetricBlock(block.id, dimensionId)
                    }
                  />
                ) : (
                  <DimensionBlockItem
                    key={block.id}
                    block={block}
                    isActive={navigation.activeBlockId === block.id}
                    onActivate={() =>
                      navigation.selectBlock(block.id, "metrics")
                    }
                    onRemoveBlock={() => removeBlock(block.id)}
                    onRemoveMetric={(metricId) =>
                      removeMetricFromDimensionBlock(block.id, metricId)
                    }
                  />
                ),
              )}
            </Accordion>
            <NewBlockDropZone
              metricBlockIds={selection.metricBlockIds}
              dimensionBlockIds={selection.dimensionBlockIds}
            />
          </>
        )}
      </Box>
      <SelectedTimelinesPanel
        timelines={timelines}
        onRemoveTimeline={toggleTimeline}
      />
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
        disabled={!canStart || isStarting}
        onClick={handleStart}
      >{t`Begin research`}</Button>
    </Stack>
  );
}

interface NewBlockDropZoneProps {
  metricBlockIds: Set<ExplorationMetric["id"]>;
  dimensionBlockIds: Set<DimensionId>;
}

/**
 * "Drop here to create a new research area" target rendered below the
 * existing accordion when blocks > 0. It only appears while a drag is
 * in flight — there's no idle UI here, the empty-state placeholder
 * (see `ResearchPlanEmptyState`) covers the no-blocks-yet case. Drops
 * route through the same `RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID` path
 * in `useExplorationDnd` so the behavior is identical to dropping on
 * the empty state.
 *
 * Hidden when the dragged entity is *already* the primary of an
 * existing block (metric in `metricBlockIds`, dimension in
 * `dimensionBlockIds`). In that case "create a new block" would be a
 * no-op — the existing block can't be duplicated — so we hide the
 * affordance to avoid suggesting an action that won't do anything.
 */
function NewBlockDropZone({
  metricBlockIds,
  dimensionBlockIds,
}: NewBlockDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID,
  });
  const dndContext = useDndContext();
  const activeData = dndContext.active?.data.current as
    | ExplorationDragData
    | undefined;
  // Only metric/dimension drags can create a new block. Timelines are
  // detached from the block model, so a timeline drag must not surface
  // this "new research area" target.
  if (activeData == null || activeData.kind === "timeline") {
    return null;
  }
  const wouldBeDuplicate =
    (activeData.kind === "metric" &&
      metricBlockIds.has(activeData.payload.id)) ||
    (activeData.kind === "dimension" &&
      dimensionBlockIds.has(activeData.payload.id));
  if (wouldBeDuplicate) {
    return null;
  }
  return (
    <Box
      ref={setNodeRef}
      className={cx(S.newBlockDropZone, {
        [S.newBlockDropZoneOver]: isOver,
      })}
      mt="sm"
      p="md"
    >
      <Text size="sm" c="text-secondary" ta="center">
        {t`Drop here to start a new research area`}
      </Text>
    </Box>
  );
}

interface SelectedTimelinesPanelProps {
  timelines: Timeline[];
  onRemoveTimeline: (timeline: Timeline) => void;
}

/**
 * The "Timelines" tray pinned above the "Begin research" button. Unlike
 * metrics/dimensions, timelines are a flat, exploration-wide selection
 * (not a per-block list), so they live in their own always-visible
 * section rather than as accordion blocks.
 *
 * It doubles as a drop target: dragging a row from the Browse →
 * Timelines panel onto this tray adds it (idempotently, via
 * `addTimelinesById` in `useExplorationDnd`).
 *
 * Visibility rule: once any timeline is picked the tray stays visible
 * (so the user can see/remove their selection). When nothing is picked
 * yet it stays hidden *until* a timeline drag is in flight, at which
 * point an empty drop target appears so the first timeline has
 * somewhere to land — mirroring `NewBlockDropZone`'s drag-only target.
 */
function SelectedTimelinesPanel({
  timelines,
  onRemoveTimeline,
}: SelectedTimelinesPanelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: RESEARCH_PLAN_TIMELINE_DROPPABLE_ID,
  });
  const dndContext = useDndContext();
  const activeData = dndContext.active?.data.current as
    | ExplorationDragData
    | undefined;
  const isTimelineDragInFlight = activeData?.kind === "timeline";
  // Hooks above run unconditionally; bail out only after they've been
  // called so the empty tray is hidden unless a timeline is being
  // dragged in.
  if (timelines.length === 0 && !isTimelineDragInFlight) {
    return null;
  }
  return (
    <Box flex="none" px="md" pt="md">
      <Text mb="xs">{t`Timelines`}</Text>
      <Box
        ref={setNodeRef}
        className={cx(S.timelinePanel, {
          [S.timelinePanelDropTarget]: isTimelineDragInFlight && !isOver,
          [S.timelinePanelDropOver]: isTimelineDragInFlight && isOver,
        })}
        p="sm"
      >
        {timelines.length === 0 ? (
          <Text size="sm" c="text-secondary" ta="center">
            {t`Drop here to add this timeline`}
          </Text>
        ) : (
          <Group align="flex-start" gap="sm" wrap="wrap">
            {timelines.map((timeline) => (
              <PillItem
                key={timeline.id}
                label={timeline.name}
                onRemove={() => onRemoveTimeline(timeline)}
              />
            ))}
          </Group>
        )}
      </Box>
    </Box>
  );
}

interface ResearchPlanEmptyStateProps {
  onAddMetric: () => void;
  onAddDimension: () => void;
}

function ResearchPlanEmptyState({
  onAddMetric,
  onAddDimension,
}: ResearchPlanEmptyStateProps) {
  // The empty state is a metric/dimension drop target only — dropping a
  // metric creates a metric block, a dimension creates a dimension
  // block. Timelines are completely detached from metrics/dimensions, so
  // a timeline drag does NOT light this area up (it lands in the
  // dedicated timelines tray instead). We treat only metric/dimension
  // drags as "in flight" here.
  const { setNodeRef, isOver } = useDroppable({
    id: RESEARCH_PLAN_EMPTY_DROPPABLE_ID,
  });
  const dndContext = useDndContext();
  const activeData = dndContext.active?.data.current as
    | ExplorationDragData
    | undefined;
  const isBlockDragInFlight =
    activeData != null && activeData.kind !== "timeline";
  return (
    <Stack
      ref={setNodeRef}
      className={cx(S.emptyState, {
        [S.emptyStateDropTarget]: isBlockDragInFlight && !isOver,
        [S.emptyStateDropOver]: isBlockDragInFlight && isOver,
      })}
      p="lg"
      gap="md"
      align="center"
    >
      <Text size="md" c="text-secondary" ta="center">
        {isBlockDragInFlight
          ? t`Drop here to start a new research area`
          : t`Pick a metric or a dimension from the Data palette — each one becomes its own research area here.`}
      </Text>
      <Group gap="sm">
        <Button
          variant="default"
          size="sm"
          leftSection={<Icon name="add" size={12} />}
          onClick={onAddMetric}
          aria-label={t`Add metrics`}
        >{t`Add metric`}</Button>
        <Button
          variant="default"
          size="sm"
          leftSection={<Icon name="add" size={12} />}
          onClick={onAddDimension}
          aria-label={t`Add dimensions`}
        >{t`Add dimension`}</Button>
      </Group>
    </Stack>
  );
}

interface BlockHeaderControlsProps {
  /**
   * Per-block "All events" + "T Range" affordances called out in the
   * wireframe. They're stubbed (no behavior) for now — the underlying
   * per-block timeline / time range model isn't wired up yet — but the
   * buttons render so layouts and accessibility labels are in place.
   */
  onRemoveBlock: () => void;
}

function BlockHeaderControls({ onRemoveBlock }: BlockHeaderControlsProps) {
  return (
    <Group gap="xs" wrap="nowrap" flex="none">
      <ActionIcon
        className={S.removeBlockButton}
        size="sm"
        variant="subtle"
        onClick={(e) => {
          e.stopPropagation();
          onRemoveBlock();
        }}
        aria-label={t`Remove area`}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Group>
  );
}

interface MetricBlockItemProps {
  block: MetricBlock;
  isActive: boolean;
  onActivate: () => void;
  onRemoveBlock: () => void;
  onRemoveDimension: (dimensionId: DimensionId) => void;
}

/**
 * Hook that wires a Research plan block as a dnd-kit drop target and
 * reports whether the *currently active* drag would land here legally
 * (i.e. cross-kind: dimension dragged over a metric block, or metric
 * dragged over a dimension block). The two booleans drive the
 * hover-state styling.
 */
function useBlockDroppable(blockId: string, blockKind: "metric" | "dimension") {
  const { setNodeRef, isOver } = useDroppable({ id: blockId });
  const dndContext = useDndContext();
  const activeData = dndContext.active?.data.current as
    | ExplorationDragData
    | undefined;
  const isActiveCompatible =
    activeData != null && isExplorationDropAccepted(blockKind, activeData.kind);
  return {
    setNodeRef,
    isOver,
    isActiveCompatible,
  };
}

/**
 * "Look at metric in depth" area — header carries the metric name +
 * per-block controls, body lists the dimensions the user wants to break
 * this metric by.
 */
function MetricBlockItem({
  block,
  isActive,
  onActivate,
  onRemoveBlock,
  onRemoveDimension,
}: MetricBlockItemProps) {
  const { setNodeRef, isOver, isActiveCompatible } = useBlockDroppable(
    block.id,
    "metric",
  );
  return (
    <Accordion.Item
      ref={setNodeRef}
      value={block.id}
      data-droppable-active={isActiveCompatible || undefined}
      data-block-id={block.id}
      data-active={isActive || undefined}
      className={cx({
        [S.accordionItemDropOver]: isActiveCompatible && isOver,
        [S.accordionItemDropTarget]: isActiveCompatible && !isOver,
        [S.accordionItemActive]: isActive,
      })}
    >
      <Box className={S.accordionControlRow}>
        <Accordion.Control>
          <Icon
            className={S.blockEntityIcon}
            name="metric"
            tooltip={t`Metric`}
            size={14}
            aria-label={t`Metric area`}
          />
          <Ellipsified>{block.metric.name}</Ellipsified>
          <Icon
            className={S.inlineChevron}
            name="chevrondown"
            size={12}
            aria-hidden
          />
        </Accordion.Control>
        <BlockHeaderControls onRemoveBlock={onRemoveBlock} />
      </Box>
      <Accordion.Panel>
        {/*
         * Inner clickable wrapper. We deliberately put `role="button"`
         * here, not on the `Accordion.Panel`, because Mantine's Panel
         * is a structural div that doesn't forward arbitrary ARIA
         * attributes. Clicking anywhere here activates the block —
         * the `Remove` pill buttons inside stop propagation
         * themselves, so they keep working.
         */}
        <Box
          onClick={onActivate}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onActivate();
            }
          }}
          aria-pressed={isActive}
          aria-label={t`Edit research area for ${block.metric.name}`}
        >
          <Stack gap="xs">
            <Text size="xs" c="text-secondary">{t`Dimensions`}</Text>
            {block.dimensions.length === 0 ? (
              <Text size="sm" c="text-secondary">
                {t`No dimensions yet — add one from the Data palette.`}
              </Text>
            ) : (
              <Group align="flex-start" gap="sm" wrap="wrap">
                {block.dimensions.map((dim) => (
                  <PillItem
                    key={dim.id}
                    label={formatDimensionLabel(dim)}
                    data-interestingness={
                      dim.dimension_interestingness || "null"
                    }
                    onRemove={() => onRemoveDimension(dim.id)}
                  />
                ))}
              </Group>
            )}
          </Stack>
        </Box>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

interface DimensionBlockItemProps {
  block: DimensionBlock;
  isActive: boolean;
  onActivate: () => void;
  onRemoveBlock: () => void;
  onRemoveMetric: (metricId: ExplorationMetric["id"]) => void;
}

/**
 * "Break by dimension" area — header carries the dimension name + the
 * per-block controls, body lists every metric that references this
 * dimension (or a sibling within its group).
 */
function DimensionBlockItem({
  block,
  isActive,
  onActivate,
  onRemoveBlock,
  onRemoveMetric,
}: DimensionBlockItemProps) {
  const { setNodeRef, isOver, isActiveCompatible } = useBlockDroppable(
    block.id,
    "dimension",
  );
  // Use the metrics-viewer's canonical dimension-icon mapping so the
  // icon next to a dimension name in the Research plan reads the
  // same as everywhere else in the product (calendar for dates,
  // string for category, int for numeric, location for geo, etc.).
  const dimensionIconName = getDimensionIcon(
    LibMetric.fromMetricDimension(block.dimension),
  );
  return (
    <Accordion.Item
      ref={setNodeRef}
      value={block.id}
      data-droppable-active={isActiveCompatible || undefined}
      data-block-id={block.id}
      data-active={isActive || undefined}
      className={cx({
        [S.accordionItemDropOver]: isActiveCompatible && isOver,
        [S.accordionItemDropTarget]: isActiveCompatible && !isOver,
        [S.accordionItemActive]: isActive,
      })}
    >
      <Box className={S.accordionControlRow}>
        <Accordion.Control>
          <Icon
            className={S.blockEntityIcon}
            name={dimensionIconName}
            tooltip={t`Dimension`}
            size={14}
            aria-label={t`Dimension area`}
          />
          <Ellipsified>{formatDimensionLabel(block.dimension)}</Ellipsified>
          <Icon
            className={S.inlineChevron}
            name="chevrondown"
            size={12}
            aria-hidden
          />
        </Accordion.Control>
        <BlockHeaderControls onRemoveBlock={onRemoveBlock} />
      </Box>
      <Accordion.Panel>
        <Box
          onClick={onActivate}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onActivate();
            }
          }}
          aria-pressed={isActive}
          aria-label={t`Edit research area for ${block.dimension.display_name ?? block.dimension.id}`}
        >
          <Stack gap="xs">
            <Text size="xs" c="text-secondary">{t`Metrics`}</Text>
            {block.metrics.length === 0 ? (
              <Text size="sm" c="text-secondary">
                {t`No metrics yet — add one from the Data palette.`}
              </Text>
            ) : (
              <Group align="flex-start" gap="sm" wrap="wrap">
                {block.metrics.map((metric) => (
                  <PillItem
                    key={metric.id}
                    label={metric.name}
                    onRemove={() => onRemoveMetric(metric.id)}
                  />
                ))}
              </Group>
            )}
          </Stack>
        </Box>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

interface PillItemProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  onRemove: () => void;
}

function PillItem({ label, onRemove, ...rest }: PillItemProps) {
  return (
    <Pill
      withRemoveButton
      onRemove={onRemove}
      bdrs="xl"
      bg="background-primary"
      bd="1px solid border"
      fw="normal"
      pl="0.875rem"
      py="0.375rem"
      px="sm"
      maw="100%"
      classNames={{ root: S.pill, remove: S.pillRemove }}
      removeButtonProps={{
        mr: 0,
        "aria-hidden": false,
        "aria-label": t`Remove`,
      }}
      {...rest}
    >
      <Ellipsified>{label}</Ellipsified>
    </Pill>
  );
}

/**
 * Render a dimension's full table-qualified label — "Table name -
 * Dimension name" when the dimension carries a group, falling back to
 * the bare `display_name` (or id as last resort) otherwise. Matches
 * the formatting shown by the Browse Dimensions picker so the pill
 * inside a metric block reads the same as the row the user dragged
 * or clicked from.
 */
function formatDimensionLabel(dim: MetricDimension): string {
  const name = dim.display_name ?? dim.id;
  const tableName = dim.group?.display_name;
  return tableName ? `${tableName} - ${name}` : name;
}

// Re-export the block union for any external consumer that imports
// types from this module.
export type { ExplorationBlock };
