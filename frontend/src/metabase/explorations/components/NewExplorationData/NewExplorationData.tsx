import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
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
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useNavigate } from "metabase/router";
import {
  Box,
  Button,
  Center,
  Group,
  Icon,
  Stack,
  Switch,
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

import { MetricBlockItem } from "./EntityBlock";
import S from "./NewExplorationData.module.css";
import { SelectedTimelinePills } from "./Pills";
import { ResearchModeIntro } from "./ResearchModeIntro";
import { AddMetricsModal, AddTimelinesModal } from "./modals";

type ActiveModal = "metrics" | "events" | null;

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
  return {
    metrics: [metricToSelection(block.metric)],
    dimensions: block.dimensions
      .filter((d) => block.selectedDimensionIds.has(d.id))
      .map(dimensionToSelection),
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
    collection_id: canonicalCollectionId(collectionId),
    // Drop empties: the planner ignores them, but they'd linger as empty sidebar headings.
    blocks: blocks.filter(isNonEmptyBlock).map(blockToSelection),
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
    removeTimelinesById,
  } = selection;
  const navigate = useNavigate();
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
  const canStart = blocks.some(isNonEmptyBlock);

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
    (blockId: string) => {
      removeBlock(blockId);
      trackExplorationPlanEdited("manual", "metrics");
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
      navigate(Urls.exploration(exploration.id));
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
    navigate,
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
      px="xxl"
      pt="xl"
      pb="lg"
      h="100%"
      w="100%"
    >
      <Group justify="space-between" align="center" flex="none">
        <Title order={3} fs="1rem" lh={1.4}>{t`Research plan`}</Title>
        <Button
          variant="outline"
          color="text-primary"
          bd="1px solid text-tertiary"
          disabled={isManualDataPickingDisabled}
          onClick={() => setActiveModal("metrics")}
        >
          {t`+ Metrics`}
        </Button>
      </Group>

      <Group gap="xxs" data-testid="selected-timelines-container">
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

      <Box
        className={S.blocksContainer}
        data-testid="selected-data-blocks-container"
        flex={1}
        mih={0}
        mt="lg"
      >
        {blocks.length === 0 ? (
          <Center h="100%" mt="-3rem">
            <ResearchModeIntro />
          </Center>
        ) : (
          <Stack gap="lg" mb="xl">
            {blocks.map((block) => (
              <MetricBlockItem
                key={block.id}
                block={block}
                expanded={getIsExpanded(block.id)}
                disabled={isManualDataPickingDisabled}
                onToggleExpand={() => toggleExpanded(block.id)}
                onRemoveBlock={() => handleRemoveBlock(block.id)}
                onToggleDimension={(dimensionId) => {
                  toggleDimensionSelected(block.id, dimensionId);
                  trackExplorationPlanEdited("manual", "dimensions");
                }}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Group justify="space-between" align="center" wrap="nowrap">
        <Switch
          style={!hasUserPrompt ? { visibility: "hidden" } : undefined}
          checked={useContextualInterestingness}
          onChange={(event) =>
            setUseContextualInterestingness(event.currentTarget.checked)
          }
          size="sm"
          label={t`Use AI to analyze and order results`}
        />
        <Button
          className={cx(!canStart && CS.hidden)}
          flex="none"
          variant="filled"
          loading={isStarting}
          disabled={isStarting || isManualDataPickingDisabled || !canStart}
          onClick={handleStart}
        >{t`Start research`}</Button>
      </Group>

      <AddMetricsModal
        opened={activeModal === "metrics"}
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

function isNonEmptyBlock(block: ExplorationBlock): boolean {
  return block.selectedDimensionIds.size > 0;
}
