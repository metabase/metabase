import { useDndContext, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { useCallback } from "react";
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
  isExplorationDropAccepted,
  isMetricBlock,
} from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
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

function buildCreateExplorationRequest(
  name: string,
  prompt: string,
  blocks: ExplorationBlock[],
  timelines: Timeline[],
): CreateExplorationRequest {
  const trimmedPrompt = prompt.trim();
  const groups = blocks.map(blockToGroup);

  // Global timeline selection (the current model has timelines as a
  // single top-level set, not per-block) is attached to the first
  // group so the BE sees them at least once. When per-block timeline
  // state lands, this collapses to writing each block's own ids.
  if (groups.length > 0 && timelines.length > 0) {
    groups[0] = {
      ...groups[0],
      timeline_ids: timelines.map((tl) => tl.id),
    };
  }

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
      p="md"
      h="100%"
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
              chevronPosition="left"
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
  if (activeData == null) {
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

interface ResearchPlanEmptyStateProps {
  onAddMetric: () => void;
  onAddDimension: () => void;
}

function ResearchPlanEmptyState({
  onAddMetric,
  onAddDimension,
}: ResearchPlanEmptyStateProps) {
  // The empty state is also a drop target. Any drag in flight is
  // compatible — dropping a metric creates a metric block, dropping
  // a dimension creates a dimension block — so we don't gate the
  // `isActiveCompatible` on entity kind here.
  const { setNodeRef, isOver } = useDroppable({
    id: RESEARCH_PLAN_EMPTY_DROPPABLE_ID,
  });
  const dndContext = useDndContext();
  const isDragInFlight = dndContext.active != null;
  return (
    <Stack
      ref={setNodeRef}
      className={cx(S.emptyState, {
        [S.emptyStateDropTarget]: isDragInFlight && !isOver,
        [S.emptyStateDropOver]: isDragInFlight && isOver,
      })}
      p="lg"
      gap="md"
      align="center"
    >
      <Text size="md" c="text-secondary" ta="center">
        {isDragInFlight
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
          <Box className={S.accordionLabelText}>
            <Ellipsified>{block.metric.name}</Ellipsified>
          </Box>
          <Text className={S.blockKindBadge} component="span">
            {t`metric`}
          </Text>
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
          <Box className={S.accordionLabelText}>
            <Ellipsified>
              {block.dimension.display_name ?? block.dimension.id}
            </Ellipsified>
          </Box>
          <Text className={S.blockKindBadge} component="span">
            {t`dimension`}
          </Text>
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

interface PillItemProps {
  label: string;
  onRemove: () => void;
}

function PillItem({ label, onRemove }: PillItemProps) {
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
