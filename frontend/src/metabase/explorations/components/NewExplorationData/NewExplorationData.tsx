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
import { useDispatch, useSelector } from "metabase/redux";
import { push } from "metabase/router";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Box,
  Button,
  Center,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Title,
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
  const applicationName = useSelector(getApplicationName);

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [createExploration, { isLoading: isStarting }] =
    useCreateExplorationMutation();

  const { messages, isDoingScience } = useMetabotAgent(EXPLORATIONS_AGENT_ID);
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

  const handleRemoveBlock = useCallback(
    (blockId: string, type: "metrics" | "dimensions") => {
      removeBlock(blockId);
      trackExplorationPlanEdited("manual", type);
      setExpandedIds((prev) => {
        if (prev.has(blockId)) {
          const next = new Set(prev);
          next.delete(blockId);
          return next;
        }
        return prev;
      });
    },
    [removeBlock],
  );

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
          aria-label={timelines.length ? t`Add events` : undefined}
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
                  onRemoveBlock={() => handleRemoveBlock(block.id, "metrics")}
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
                  onRemoveBlock={() =>
                    handleRemoveBlock(block.id, "dimensions")
                  }
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

      <Group justify="space-between" align="center" wrap="nowrap">
        <Text
          c="text-secondary"
          size="sm"
          lh="1rem"
        >{t`${applicationName} will automate running combinations of these pairings and then do a basic analysis of the results.`}</Text>
        <Button
          className={cx(!canStart && CS.hidden)} // hide with css to make sure caption text is aligned vertically
          aria-hidden={!canStart || undefined}
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
