import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { trackExplorationCreated } from "metabase/explorations/analytics";
import type {
  ExplorationBlock,
  ExplorationSelection,
} from "metabase/explorations/hooks";
import { isMetricBlock } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useDispatch, useSelector } from "metabase/redux";
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
  CreateExplorationRequest,
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

function blockToGroup(block: ExplorationBlock) {
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
): CreateExplorationRequest {
  const trimmedPrompt = prompt.trim();

  return {
    name,
    prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
    // Timelines are thread-scoped — sent once, not per group.
    timeline_ids: timelines.map((tl) => tl.id),
    groups: blocks.map(blockToGroup),
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
  const applicationName = useSelector(getApplicationName);

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [createExploration, { isLoading: isStarting }] =
    useCreateExplorationMutation();

  const { messages } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  const isExpanded = useCallback(
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
      gap="sm"
      bg="background-primary"
      flex={1}
      px="xl"
      py="md"
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
                color="text-secondary"
                size="sm"
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

      <Group gap="xs">
        {timelines.length > 0 && (
          <SelectedTimelinePills
            timelines={timelines}
            onRemoveTimeline={toggleTimeline}
            onShowMore={() => setActiveModal("events")}
          />
        )}
        <Button
          variant="subtle"
          c="text-secondary"
          size="sm"
          bd="1px dashed border"
          bdrs="xl"
          leftSection={<Icon name="add" c="text-secondary" size={12} />}
          onClick={() => setActiveModal("events")}
        >
          {!timelines.length ? t`Events` : null}
        </Button>
      </Group>

      <Box flex={1} mih={0} mt="md" style={{ overflowY: "auto" }}>
        {blocks.length === 0 ? (
          <Center h="100%" mt="-3rem">
            <ResearchModeIntro />
          </Center>
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

      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Text
          c="text-secondary"
          size="sm"
          lh="1rem"
        >{t`${applicationName} will automate running combinations of these pairings and then do a basic analysis of the results.`}</Text>
        {canStart && (
          <Button
            size="sm"
            flex="none"
            variant="filled"
            loading={isStarting}
            disabled={isStarting}
            onClick={handleStart}
          >{t`Start research`}</Button>
        )}
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
