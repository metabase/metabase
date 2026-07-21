import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import {
  trackExplorationCreated,
  trackExplorationPlanEdited,
} from "metabase/explorations/analytics";
import type {
  ExplorationBlock,
  ExplorationSelection,
} from "metabase/explorations/hooks";
import { isMetricBlock } from "metabase/explorations/hooks";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  Box,
  Button,
  Center,
  Group,
  Icon,
  Menu,
  Stack,
  Switch,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  CollectionId,
  CreateExplorationRequest,
  ExplorationMetric,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

import { EXPLORATIONS_AGENT_ID } from "../NewExplorationChat/NewExplorationChat";

import { DimensionBlockItem, MetricBlockItem } from "./EntityBlock";
import S from "./NewExplorationData.module.css";
import { SelectedTimelinePills } from "./Pills";
import { ResearchModeIntro } from "./ResearchModeIntro";
import {
  AddDimensionsModal,
  AddMetricsModal,
  AddTimelinesModal,
} from "./modals";

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

function blockToSelection(block: ExplorationBlock) {
  if (isMetricBlock(block)) {
    return {
      type: "metric" as const,
      metrics: [metricToSelection(block.metric)],
      dimensions: block.dimensions
        .filter((d) => block.selectedDimensionIds.has(d.id))
        .map(dimensionToSelection),
    };
  }
  return {
    type: "dimension" as const,
    metrics: block.metrics
      .filter((m) => block.selectedMetricIds.has(m.id))
      .map(metricToSelection),
    dimensions: block.groupDimensions.map(dimensionToSelection),
  };
}

export function buildCreateExplorationRequest(
  name: string,
  prompt: string,
  blocks: ExplorationBlock[],
  timelines: Timeline[],
  collectionId: CollectionId | null,
): CreateExplorationRequest {
  const trimmedPrompt = prompt.trim();

  return {
    name,
    prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
    timeline_ids: timelines.map((tl) => tl.id),
    collection_id: collectionId,
    blocks: blocks.map(blockToSelection),
  };
}

export function NewExplorationData({ selection }: NewExplorationDataProps) {
  const {
    blocks,
    timelines,
    name,
    collection,
    removeBlock,
    toggleDimensionSelected,
    toggleMetricSelected,
    removeTimelinesById,
  } = selection;
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [useContextualInterestingness, setUseContextualInterestingness] =
    useState(true);

  const [createExploration, { isLoading: isStarting }] =
    useCreateExplorationMutation();

  const { messages, isDoingScience } = useMetabotAgent(EXPLORATIONS_AGENT_ID);
  const hasUserPrompt = messages.some(
    (message) => message.role === "user" && message.message.trim().length > 0,
  );
  const canStart = blocks.length > 0;

  const isManualDataPickingDisabled = isDoingScience;

  const getIsExpanded = useCallback(
    (blockId: string) => expandedIds.has(blockId),
    [expandedIds],
  );
  const toggleExpanded = useCallback((blockId: string) => {
    setExpandedIds((prev) => {
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
    const prompt =
      hasUserPrompt && useContextualInterestingness
        ? messages
            .filter((message) => message.role === "user")
            .map((message) => message.message)
            .join("\n---\n")
        : "";
    const request = buildCreateExplorationRequest(
      name,
      prompt,
      blocks,
      timelines,
      collection.id ?? null,
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
    hasUserPrompt,
    useContextualInterestingness,
    messages,
    blocks,
    timelines,
    name,
    collection.id,
    sendToast,
  ]);

  return (
    <Stack
      className={S.container}
      data-testid="research-content"
      gap="sm"
      bg="background-primary"
      flex={1}
      px="xl"
      pt="lg"
      pb="md"
      h="100%"
      w="100%"
    >
      <Group justify="space-between" align="center" flex="none">
        <Title order={3} fs="1rem" lh={1.4}>{t`Research plan`}</Title>
        <Group gap="xs">
          <Menu position="bottom-end">
            <Menu.Target>
              <Button
                variant="outline"
                color="text-primary"
                bd="1px solid text-tertiary"
                size="sm"
                disabled={isManualDataPickingDisabled}
              >{t`+ Data`}</Button>
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

      <Group gap="xs">
        {timelines.length > 0 && (
          <SelectedTimelinePills
            timelines={timelines}
            disabled={isManualDataPickingDisabled}
            onRemoveTimeline={(timeline) => {
              removeTimelinesById([timeline.id]);
              trackExplorationPlanEdited("manual", "timelines");
            }}
            onShowMore={() => {
              if (isManualDataPickingDisabled) {
                return;
              }
              setActiveModal("events");
            }}
          />
        )}
        <Button
          variant="subtle"
          c="text-secondary"
          size="sm"
          bd="1px dashed border"
          bdrs="xl"
          leftSection={
            timelines.length ? <Icon name="add" size={12} /> : undefined
          }
          disabled={isManualDataPickingDisabled}
          onClick={() => setActiveModal("events")}
        >
          {!timelines.length ? t`+ Events` : null}
        </Button>
      </Group>

      <Box className={S.blocksContainer} flex={1} mih={0} mt="md">
        {blocks.length === 0 ? (
          <Center h="100%" mt="-3rem">
            <ResearchModeIntro />
          </Center>
        ) : (
          <Stack gap="md" mb="lg">
            {blocks.map((block) =>
              isMetricBlock(block) ? (
                <MetricBlockItem
                  key={block.id}
                  block={block}
                  expanded={getIsExpanded(block.id)}
                  disabled={isManualDataPickingDisabled}
                  onToggleExpand={() => toggleExpanded(block.id)}
                  onRemoveBlock={() => {
                    removeBlock(block.id);
                    trackExplorationPlanEdited("manual", "metrics");
                  }}
                  onToggleDimension={(dimensionId) => {
                    toggleDimensionSelected(block.id, dimensionId);
                    trackExplorationPlanEdited("manual", "dimensions");
                  }}
                />
              ) : (
                <DimensionBlockItem
                  key={block.id}
                  block={block}
                  expanded={getIsExpanded(block.id)}
                  disabled={isManualDataPickingDisabled}
                  onToggleExpand={() => toggleExpanded(block.id)}
                  onRemoveBlock={() => {
                    removeBlock(block.id);
                    trackExplorationPlanEdited("manual", "dimensions");
                  }}
                  onToggleMetric={(metricId) => {
                    toggleMetricSelected(block.id, metricId);
                    trackExplorationPlanEdited("manual", "metrics");
                  }}
                />
              ),
            )}
          </Stack>
        )}
      </Box>

      <Group
        justify={hasUserPrompt ? "space-between" : "flex-end"}
        align="center"
        wrap="nowrap"
      >
        {hasUserPrompt && (
          <Group gap="sm" align="center" wrap="nowrap">
            <Switch
              id="use-contextual-interestingness"
              checked={useContextualInterestingness}
              onChange={(event) =>
                setUseContextualInterestingness(event.currentTarget.checked)
              }
              size="sm"
            />
            <Box
              component="label"
              className={S.contextualInterestingnessToggleLabel}
              htmlFor="use-contextual-interestingness"
            >
              <Box component="span" fz="sm" c="text-secondary">
                {t`Use AI to order charts by interestingness`}
              </Box>
              <Tooltip
                label={t`Uses AI tokens. Turn off to use basic ordering only.`}
              >
                <Icon
                  name="info"
                  size={14}
                  c="text-secondary"
                  aria-label={t`More information`}
                />
              </Tooltip>
            </Box>
          </Group>
        )}
        <Button
          className={cx(!canStart && CS.hidden)} // hide with css to make sure toggle is aligned vertically
          size="sm"
          flex="none"
          variant="filled"
          loading={isStarting}
          disabled={isStarting || isManualDataPickingDisabled}
          onClick={handleStart}
        >{t`Start research`}</Button>
      </Group>

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
