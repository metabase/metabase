import { useDndContext, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type HTMLAttributes, useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { getDimensionIcon } from "metabase/common/utils/columns";
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
  UnstyledButton,
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
          : t`Use AI agent to pick metrics and dimensions automatically for your research, or pick them from the Data palette.`}
      </Text>
      <Group gap="sm">
        <Button
          variant="subtle"
          size="sm"
          leftSection={<Icon name="add" size={12} />}
          onClick={onAddMetric}
          aria-label={t`Add metrics`}
        >{t`Add metric`}</Button>
        <Button
          variant="subtle"
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
        <UnstyledButton
          className={S.blockHeaderSelectArea}
          onClick={onActivate}
          aria-pressed={isActive}
          aria-label={t`Select research area for ${block.metric.name}`}
        />
        <BlockHeaderControls onRemoveBlock={onRemoveBlock} />
      </Box>
      <Accordion.Panel>
        {/* Inner clickable wrapper */}
        <Box
          className={S.blockBody}
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
        <UnstyledButton
          className={S.blockHeaderSelectArea}
          onClick={onActivate}
          aria-pressed={isActive}
          aria-label={t`Select research area for ${block.dimension.display_name ?? block.dimension.id}`}
        />
        <BlockHeaderControls onRemoveBlock={onRemoveBlock} />
      </Box>
      <Accordion.Panel>
        <Box
          className={S.blockBody}
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

function formatDimensionLabel(dim: MetricDimension): string {
  const name = dim.display_name ?? dim.id;
  const tableName = dim.group?.display_name;
  return tableName ? `${tableName} - ${name}` : name;
}
