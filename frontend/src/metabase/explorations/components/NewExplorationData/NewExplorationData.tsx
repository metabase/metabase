import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import type {
  ExplorationMetric,
  MetricDimension,
  Timeline,
} from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Pill,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import type { CreateExplorationRequest } from "metabase-types/api";

import { EXPLORATIONS_AGENT_ID } from "../NewExplorationChat/NewExplorationChat";

import { AddMetricsModal } from "./AddMetricsModal";
import { AddTimelinesModal } from "./AddTimelinesModal";
import S from "./NewExplorationData.module.css";

export interface NewExplorationDataProps {
  metrics: ExplorationMetric[];
  setMetrics: (metrics: ExplorationMetric[]) => void;
  dimensions: MetricDimension[];
  setDimensions: (dimensions: MetricDimension[]) => void;
  timelines: Timeline[];
  setTimelines: (timelines: Timeline[]) => void;
}

function buildCreateExplorationRequest(
  prompt: string,
  metrics: ExplorationMetric[],
  dimensions: MetricDimension[],
  timelines: Timeline[],
): CreateExplorationRequest {
  const trimmedPrompt = prompt.trim();
  return {
    name: trimmedPrompt.length > 0 ? trimmedPrompt : t`New exploration`,
    prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
    metrics: metrics.map((m) => ({
      card_id: m.id,
      dimension_mappings: m.dimension_mappings,
    })),
    dimensions: dimensions.map((d) => ({
      dimension_id: d.id,
      display_name: d["display-name"],
      effective_type: d["effective-type"],
      semantic_type: d["semantic-type"],
    })),
    timeline_ids: timelines.map((tl) => tl.id),
  };
}

export function NewExplorationData({
  metrics,
  setMetrics,
  dimensions,
  setDimensions,
  timelines,
  setTimelines,
}: NewExplorationDataProps) {
  const dispatch = useDispatch();

  const [isAddMetricsModalOpen, setIsAddMetricsModalOpen] = useState(false);
  const [isAddTimelinesModalOpen, setIsAddTimelinesModalOpen] = useState(false);

  const [createExploration, { isLoading: isStarting }] =
    useCreateExplorationMutation();

  const { messages } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  const handleStart = useCallback(async () => {
    const prompt = messages
      .filter((message) => message.role === "user")
      .map((message) => message.message)
      .join("\n---\n");
    const request = buildCreateExplorationRequest(
      prompt,
      metrics,
      dimensions,
      timelines,
    );
    const exploration = await createExploration(request).unwrap();
    dispatch(push(`/explorations/${exploration.id}`));
  }, [createExploration, dispatch, messages, metrics, dimensions, timelines]);

  const canStart = metrics.length > 0;

  return (
    <>
      <Stack
        w="30rem"
        h="100%"
        gap={0}
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
      >
        <Box flex={2} mih={0}>
          <NewExplorationSection
            title={t`Exploration data`}
            onOpenModal={() => setIsAddMetricsModalOpen(true)}
            ariaLabel={t`Add metrics and dimensions`}
          >
            {metrics.length > 0 || dimensions.length > 0 ? (
              <>
                <Text>{t`Metrics`}</Text>
                <PillList
                  items={metrics}
                  onRemove={(id) =>
                    setMetrics(metrics.filter((metric) => metric.id !== id))
                  }
                />
                <Text>{t`Dimensions`}</Text>
                <PillList
                  items={dimensions.map(dimensionToPillItem)}
                  onRemove={(id) =>
                    setDimensions(
                      dimensions.filter((dimension) => dimension.id !== id),
                    )
                  }
                />
              </>
            ) : (
              <Text py="sm" c="text-secondary">
                {t`Manually add metrics and dimensions to explore or ask for help from the agent.`}
              </Text>
            )}
          </NewExplorationSection>
        </Box>
        <Box flex={1} mih={0}>
          <NewExplorationSection
            title={t`Timelines`}
            onOpenModal={() => setIsAddTimelinesModalOpen(true)}
            ariaLabel={t`Add timelines`}
          >
            {timelines.length > 0 ? (
              <PillList
                items={timelines}
                onRemove={(id) =>
                  setTimelines(
                    timelines.filter((timeline) => timeline.id !== id),
                  )
                }
              />
            ) : (
              <Text py="sm" c="text-secondary">
                {t`Add timelines to help look for correlations in your data. You can ask the agent for timeline data you might not already have.`}
              </Text>
            )}
          </NewExplorationSection>
        </Box>
        <Button
          flex={"none"}
          mx="lg"
          my="md"
          size="sm"
          variant="filled"
          loading={isStarting}
          disabled={!canStart || isStarting}
          onClick={handleStart}
        >{t`Start exploration`}</Button>
      </Stack>
      <AddMetricsModal
        opened={isAddMetricsModalOpen}
        onClose={() => setIsAddMetricsModalOpen(false)}
        selectedMetrics={metrics}
        selectedDimensions={dimensions}
        onSelectedItemsChange={(newMetrics, newDimensions) => {
          setMetrics(newMetrics);
          setDimensions(newDimensions);
        }}
      />
      <AddTimelinesModal
        opened={isAddTimelinesModalOpen}
        onClose={() => setIsAddTimelinesModalOpen(false)}
        selectedTimelines={timelines}
        onSelectedItemsChange={setTimelines}
      />
    </>
  );
}

interface NewExplorationSectionProps {
  title: string;
  ariaLabel: string;
  onOpenModal: () => void;
  children: React.ReactNode;
}

function NewExplorationSection({
  title,
  ariaLabel,
  onOpenModal,
  children,
}: NewExplorationSectionProps) {
  return (
    <Stack h="100%" px="md" pt="sm" className={S.section}>
      <Group justify="space-between" align="center">
        <Text size="lg" fw="bold">
          {title}
        </Text>
        <ActionIcon aria-label={ariaLabel} onClick={onOpenModal}>
          <Icon name="add" c="icon-primary" />
        </ActionIcon>
      </Group>
      {children}
    </Stack>
  );
}

interface PillItem {
  id: number | string;
  name: string;
}

function dimensionToPillItem(item: MetricDimension): PillItem {
  return {
    id: item.id,
    name: item["display-name"],
  };
}

interface PillListProps {
  items: PillItem[];
  onRemove: (id: number | string) => void;
}

function PillList({ items, onRemove }: PillListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ScrollArea mih="2rem" type="auto" offsetScrollbars="y">
      <Group align="flex-start" gap="sm">
        {items.map((item) => (
          <Pill
            key={item.id}
            withRemoveButton
            onRemove={() => onRemove(item.id)}
            bdrs="xl"
            bg="background-secondary"
            fw="normal"
            px="sm"
            py="xs"
            removeButtonProps={{
              mr: 0,
            }}
          >
            {item.name}
          </Pill>
        ))}
      </Group>
    </ScrollArea>
  );
}
