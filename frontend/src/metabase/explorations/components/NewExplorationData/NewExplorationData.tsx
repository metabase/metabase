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
import {
  type DimensionPillGroup,
  groupDimensionsByCategory,
  removeMetricFromSelection,
} from "./utils";

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

  const dimensionCategories = useMemo(
    () => groupDimensionsByCategory(dimensions),
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

  const handleRemoveDimensionPill = useCallback(
    (pill: DimensionPillGroup) => {
      const dimensionsToRemove = new Set(pill.dimensions.map((d) => d.id));
      setDimensions(
        dimensions.filter((dimension) => !dimensionsToRemove.has(dimension.id)),
      );
    },
    [dimensions, setDimensions],
  );

  const handleRemoveTimeline = useCallback(
    (id: number | string) => {
      setTimelines(timelines.filter((timeline) => timeline.id !== id));
    },
    [timelines, setTimelines],
  );

  return (
    <>
      <Stack gap={0} bg="background-secondary" w="28.75rem" h="100%">
        <Stack gap={0} flex={1} mih={0} style={{ overflowY: "auto" }}>
          <SectionHeader
            title={t`Data`}
            ariaLabel={t`Add metrics and dimensions`}
            onAdd={handleOpenMetricsModal}
          />
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
                    <Text size="md" c="text-secondary">
                      {t`No metrics yet. Click + to add some.`}
                    </Text>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="dimensions">
                <Accordion.Control>{t`Dimensions`}</Accordion.Control>
                <Accordion.Panel>
                  {dimensionCategories.length > 0 ? (
                    <Box pl="0.25rem">
                      <DimensionCategoryList
                        categories={dimensionCategories}
                        onRemove={handleRemoveDimensionPill}
                      />
                    </Box>
                  ) : (
                    <Text size="md" c="text-secondary">
                      {t`No dimensions yet. Click + to add some.`}
                    </Text>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          ) : (
            <Box px="xl" pb="md" flex={1}>
              <Text size="md" c="text-secondary" lh="1.25rem" w="18rem">
                {t`Add metrics and dimensions you'd like to see specifically or have the agent help you assemble.`}
              </Text>
            </Box>
          )}

          <SectionHeader
            title={t`Timelines`}
            ariaLabel={t`Add timelines`}
            onAdd={handleOpenTimelinesModal}
          />
          <Box mih={0} px="xl">
            {hasTimelines ? (
              <PillList items={timelines} onRemove={handleRemoveTimeline} />
            ) : (
              <Text size="md" pb="md" c="text-secondary" lh="1.25rem" w="18rem">
                {t`Add timelines to see if events shed light on data movement.`}
              </Text>
            )}
          </Box>
        </Stack>
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
  interestingness?: number | null;
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
            bd="1px solid border"
            fw="normal"
            pl="1.25rem"
            py="0.625rem"
            px="sm"
            data-interestingness={formatInterestingness(item.interestingness)}
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

function formatInterestingness(score: number | null | undefined): string {
  return score == null ? "null" : String(score);
}

function pickMaxInterestingness(dimensions: MetricDimension[]): number | null {
  let max: number | null = null;
  for (const dimension of dimensions) {
    const score = dimension.dimension_interestingness;
    if (score == null) {
      continue;
    }
    if (max == null || score > max) {
      max = score;
    }
  }
  return max;
}

interface DimensionCategoryListProps {
  categories: Array<{
    key: string;
    label: string;
    pillGroups: DimensionPillGroup[];
  }>;
  onRemove: (pill: DimensionPillGroup) => void;
}

function DimensionCategoryList({
  categories,
  onRemove,
}: DimensionCategoryListProps) {
  const visibleCategories = categories.filter(
    (category) => category.pillGroups.length > 0,
  );

  if (visibleCategories.length === 0) {
    return null;
  }

  return (
    <Stack gap="lg">
      {visibleCategories.map((category) => (
        <Group
          key={category.key}
          align="flex-start"
          wrap="nowrap"
          gap="md"
          role="group"
          aria-label={category.label}
        >
          <Text size="md" c="text-primary" w="5.25rem" flex="none" pt="0.5rem">
            {category.label}
          </Text>
          <Box flex={1} mih={0}>
            <Group align="flex-start" gap="sm">
              {category.pillGroups.map((pill) => (
                <Pill
                  key={pill.id}
                  withRemoveButton
                  onRemove={() => onRemove(pill)}
                  bdrs="xl"
                  bg="background-primary"
                  bd="1px solid border"
                  fw="normal"
                  pl="1.25rem"
                  py="0.625rem"
                  px="sm"
                  data-interestingness={formatInterestingness(
                    pickMaxInterestingness(pill.dimensions),
                  )}
                  removeButtonProps={{
                    mr: 0,
                    "aria-hidden": false,
                    "aria-label": t`Remove`,
                  }}
                >
                  {pill.name}
                </Pill>
              ))}
            </Group>
          </Box>
        </Group>
      ))}
    </Stack>
  );
}
