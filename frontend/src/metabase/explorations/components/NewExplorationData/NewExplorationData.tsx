import type { MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import {
  Accordion,
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
import type {
  CreateExplorationRequest,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

import { EXPLORATIONS_AGENT_ID } from "../NewExplorationChat/NewExplorationChat";

import { AddMetricsModal } from "./AddMetricsModal";
import { AddTimelinesModal } from "./AddTimelinesModal";
import S from "./NewExplorationData.module.css";
import { groupDimensionsBySource, removeMetricFromSelection } from "./utils";

export interface NewExplorationDataProps {
  metrics: ExplorationMetric[];
  setMetrics: (metrics: ExplorationMetric[]) => void;
  dimensions: MetricDimension[];
  setDimensions: (dimensions: MetricDimension[]) => void;
  timelines: Timeline[];
  setTimelines: (timelines: Timeline[]) => void;
  name: string | null;
}

function buildCreateExplorationRequest(
  name: string | null,
  prompt: string,
  metrics: ExplorationMetric[],
  dimensions: MetricDimension[],
  timelines: Timeline[],
): CreateExplorationRequest {
  const trimmedPrompt = prompt.trim();
  return {
    name: name ? name : t`New exploration`,
    prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
    metrics: metrics.map((m) => ({
      card_id: m.id,
      dimension_mappings: m.dimension_mappings,
    })),
    dimensions: dimensions.map((d) => ({
      dimension_id: d.id,
      display_name: d.display_name,
      effective_type: d.effective_type,
      semantic_type: d.semantic_type,
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
  name,
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
      name,
      prompt,
      metrics,
      dimensions,
      timelines,
    );
    const exploration = await createExploration(request).unwrap();
    dispatch(push(`/explorations/${exploration.id}`));
  }, [
    createExploration,
    dispatch,
    messages,
    metrics,
    dimensions,
    timelines,
    name,
  ]);

  const canStart = metrics.length > 0 && dimensions.length > 0;

  const groupedDimensions = useMemo(
    () => groupDimensionsBySource(dimensions),
    [dimensions],
  );

  const hasMetricsOrDimensions = metrics.length > 0 || dimensions.length > 0;
  const hasTimelines = timelines.length > 0;

  const handleOpenMetricsModal = useCallback((event?: MouseEvent) => {
    event?.stopPropagation();
    setIsAddMetricsModalOpen(true);
  }, []);
  const handleOpenTimelinesModal = useCallback((event?: MouseEvent) => {
    event?.stopPropagation();
    setIsAddTimelinesModalOpen(true);
  }, []);

  const handleRemoveMetric = useCallback(
    (id: number | string) => {
      const { metrics: nextMetrics, dimensions: nextDimensions } =
        removeMetricFromSelection(
          metrics,
          dimensions,
          id as ExplorationMetric["id"],
        );
      setMetrics(nextMetrics);
      if (nextDimensions !== dimensions) {
        setDimensions(nextDimensions);
      }
    },
    [metrics, dimensions, setMetrics, setDimensions],
  );

  const handleRemoveDimensionGroup = useCallback(
    (groupId: number | string) => {
      const group = groupedDimensions.find((g) => g.id === groupId);
      if (!group) {
        return;
      }
      const dimensionsToRemove = new Set(
        group.dimensions.map((dimension) => dimension.id),
      );
      setDimensions(
        dimensions.filter((dimension) => !dimensionsToRemove.has(dimension.id)),
      );
    },
    [groupedDimensions, dimensions, setDimensions],
  );

  const handleRemoveTimeline = useCallback(
    (id: number | string) => {
      setTimelines(timelines.filter((timeline) => timeline.id !== id));
    },
    [timelines, setTimelines],
  );

  return (
    <>
      <Stack w="28.75rem" h="100%" gap={0} bg="background-secondary">
        <SectionHeader
          title={t`Data`}
          ariaLabel={t`Add metrics and dimensions`}
          onAdd={handleOpenMetricsModal}
        />
        <Box flex={4} mih="18rem" style={{ overflowY: "auto" }}>
          {hasMetricsOrDimensions ? (
            <Accordion
              multiple
              defaultValue={["metrics", "dimensions"]}
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
              <Accordion.Item value="metrics">
                <Accordion.Control>{t`Metrics`}</Accordion.Control>
                <Accordion.Panel>
                  {metrics.length > 0 ? (
                    <PillList items={metrics} onRemove={handleRemoveMetric} />
                  ) : (
                    <Text size="sm" c="text-secondary">
                      {t`No metrics yet. Click + to add some.`}
                    </Text>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="dimensions">
                <Accordion.Control>{t`Dimensions`}</Accordion.Control>
                <Accordion.Panel>
                  {groupedDimensions.length > 0 ? (
                    <PillList
                      items={groupedDimensions}
                      onRemove={handleRemoveDimensionGroup}
                    />
                  ) : (
                    <Text size="sm" c="text-secondary">
                      {t`No dimensions yet. Click + to add some.`}
                    </Text>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          ) : (
            <Box px="xl" pb="md">
              <Text size="md" c="text-secondary" lh="1.25rem" w="18rem">
                {t`Add metrics and dimensions you'd like to see specifically or have the agent help you assemble.`}
              </Text>
            </Box>
          )}
        </Box>

        <Box flex={1} mih={0} style={{ overflowY: "auto" }}>
          {hasTimelines ? (
            <Accordion
              defaultValue="timelines"
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
              <Accordion.Item value="timelines">
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" w="100%">
                    <Text fw="bold">{t`Timelines`}</Text>
                    <ActionIcon
                      component="div"
                      role="button"
                      aria-label={t`Add timelines`}
                      onClick={handleOpenTimelinesModal}
                    >
                      <Icon name="add" c="icon-primary" />
                    </ActionIcon>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <PillList items={timelines} onRemove={handleRemoveTimeline} />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          ) : (
            <>
              <SectionHeader
                title={t`Timelines`}
                ariaLabel={t`Add timelines`}
                onAdd={handleOpenTimelinesModal}
              />
              <Box px="xl" pb="md" lh="1.25rem">
                <Text size="md" c="text-secondary" lh="1.25rem" w="18rem">
                  {t`Add timelines to see if events shed light on data movement.`}
                </Text>
              </Box>
            </>
          )}
        </Box>
        <Button
          flex="none"
          mx="xl"
          my="lg"
          size="sm"
          variant="filled"
          loading={isStarting}
          disabled={!canStart || isStarting}
          onClick={handleStart}
        >{t`Begin research`}</Button>
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

interface SectionHeaderProps {
  title: string;
  ariaLabel: string;
  onAdd: () => void;
}

function SectionHeader({ title, ariaLabel, onAdd }: SectionHeaderProps) {
  return (
    <Group justify="space-between" align="center" px="xl" py="md">
      <Text fw="bold">{title}</Text>
      <ActionIcon
        className={S.sectionAddIcon}
        bg="background-primary"
        bd="1px solid border"
        aria-label={ariaLabel}
        onClick={onAdd}
      >
        <Icon name="add" size={12} c="icon-primary" />
      </ActionIcon>
    </Group>
  );
}

interface PillItem {
  id: number | string;
  name: string;
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
            bg="background-primary"
            fw="normal"
            px="sm"
            py="xs"
            removeButtonProps={{
              mr: 0,
              "aria-hidden": false,
              "aria-label": t`Remove`,
            }}
          >
            {item.name}
          </Pill>
        ))}
      </Group>
    </ScrollArea>
  );
}
