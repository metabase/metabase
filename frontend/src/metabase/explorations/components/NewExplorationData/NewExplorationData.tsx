import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import {
  trackExplorationCreated,
  trackExplorationPlanEdited,
} from "metabase/explorations/analytics";
import type {
  ExplorationNavigation,
  ExplorationSelection,
} from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import {
  Accordion,
  ActionIcon,
  Box,
  Button,
  Ellipsified,
  Group,
  Icon,
  Pill,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  CollectionId,
  CreateExplorationRequest,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

import { EXPLORATIONS_AGENT_ID } from "../NewExplorationChat/NewExplorationChat";

import S from "./NewExplorationData.module.css";
import {
  type DimensionPillGroup,
  groupDimensionsByCategory,
  removeMetricFromSelection,
} from "./utils";

export interface NewExplorationDataProps {
  selection: ExplorationSelection;
  navigation: ExplorationNavigation;
}

function buildCreateExplorationRequest(
  name: string,
  prompt: string,
  metrics: ExplorationMetric[],
  dimensions: MetricDimension[],
  timelines: Timeline[],
  collectionId: CollectionId | null,
): CreateExplorationRequest {
  const trimmedPrompt = prompt.trim();
  return {
    name,
    prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
    collection_id: collectionId,
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
  selection,
  navigation,
}: NewExplorationDataProps) {
  const {
    metrics,
    setMetrics,
    dimensions,
    setDimensions,
    timelines,
    name,
    toggleTimeline,
  } = selection;
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  // Default new explorations to the user's Personal Collection. The backend
  // places an exploration with no collection_id in "Our Analytics" (root), so
  // the FE passes the personal collection to keep new explorations private.
  const personalCollectionId =
    useSelector(getUser)?.personal_collection_id ?? null;

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
      personalCollectionId,
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
        message: t`Failed to begin research`,
      });
    }
  }, [
    createExploration,
    dispatch,
    messages,
    metrics,
    dimensions,
    timelines,
    name,
    personalCollectionId,
    sendToast,
  ]);

  const canStart = metrics.length > 0 && dimensions.length > 0;

  const dimensionCategories = useMemo(
    () => groupDimensionsByCategory(dimensions),
    [dimensions],
  );

  const handleRemoveMetric = useCallback(
    (id: number | string) => {
      trackExplorationPlanEdited("manual", "metrics");
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
      trackExplorationPlanEdited("manual", "dimensions");
      const dimensionsToRemove = new Set(pill.dimensions.map((d) => d.id));
      setDimensions(
        dimensions.filter((dimension) => !dimensionsToRemove.has(dimension.id)),
      );
    },
    [dimensions, setDimensions],
  );

  const handleRemoveTimeline = useCallback(
    (id: number | string) => {
      trackExplorationPlanEdited("manual", "timelines");
      const timeline = timelines.find((t) => t.id === id);
      if (timeline) {
        toggleTimeline(timeline);
      }
    },
    [timelines, toggleTimeline],
  );

  return (
    <Stack
      className={S.container}
      data-testid="research-content"
      gap="md"
      bg="background-secondary"
      flex={0.68}
      p="md"
      maw="37.5rem"
      miw="28.75rem"
      h="100%"
    >
      <Box flex={1} mih={0} style={{ overflowY: "auto" }}>
        <Title order={4} fs="1rem" lh={1.5} p="md">{t`Research content`}</Title>
        <Accordion
          multiple
          defaultValue={["metrics", "dimensions", "timelines"]}
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
          <SectionItem
            value="metrics"
            title={t`Metrics`}
            addLabel={t`Add metrics`}
            onAdd={() => navigation.openBrowse("metrics")}
          >
            {metrics.length > 0 ? (
              <PillList items={metrics} onRemove={handleRemoveMetric} />
            ) : (
              <Text size="md" c="text-secondary">
                {t`Add metrics you’re interested in or ask the agent to help find metrics relevant to your question.`}
              </Text>
            )}
          </SectionItem>

          <SectionItem
            value="dimensions"
            title={t`Dimensions`}
            addLabel={t`Add dimensions`}
            onAdd={() => navigation.openBrowse("dimensions")}
          >
            {dimensionCategories.length > 0 ? (
              <Box pl="0.25rem">
                <DimensionCategoryList
                  categories={dimensionCategories}
                  onRemove={handleRemoveDimensionPill}
                />
              </Box>
            ) : (
              <Text size="md" c="text-secondary">
                {t`Not sure which metrics to add but know you’re interested in place, or time? You can also work backwards by specifying a dimension you care about and we’ll bring in metrics that have that dimension for you.`}
              </Text>
            )}
          </SectionItem>

          <SectionItem
            value="timelines"
            title={t`Timelines`}
            addLabel={t`Add timelines`}
            onAdd={() => navigation.openBrowse("timelines")}
          >
            {timelines.length > 0 ? (
              <PillList items={timelines} onRemove={handleRemoveTimeline} />
            ) : (
              <Text size="md" c="text-secondary" lh="1.25rem">
                {t`Add timelines to see if events shed light on data movement.`}
              </Text>
            )}
          </SectionItem>
        </Accordion>
      </Box>
      <Button
        className={S.beginButton}
        flex="none"
        size="sm"
        w="100%"
        maw="25rem"
        mx="2rem"
        variant="filled"
        loading={isStarting}
        disabled={!canStart || isStarting}
        onClick={handleStart}
      >{t`Begin research`}</Button>
    </Stack>
  );
}

interface SectionItemProps {
  value: string;
  title: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}

/**
 * One accordion section — a collapsible Metrics/Dimensions/Timelines
 * panel. The "+" sits beside the collapse control (not inside it, to
 * avoid nesting `<button>`s) and deep-links into the Browse picker.
 */
function SectionItem({
  value,
  title,
  addLabel,
  onAdd,
  children,
}: SectionItemProps) {
  return (
    <Accordion.Item value={value}>
      <Box className={S.accordionControlRow}>
        <Accordion.Control>{title}</Accordion.Control>
        <ActionIcon
          className={S.sectionAddIcon}
          ml="lg"
          mr="0.75rem"
          bg="background-primary"
          bd="1px solid border"
          aria-label={addLabel}
          onClick={onAdd}
        >
          <Icon name="add" size={12} c="icon-primary" />
        </ActionIcon>
      </Box>
      <Accordion.Panel>{children}</Accordion.Panel>
    </Accordion.Item>
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
      <Group align="flex-start" gap="sm" wrap="wrap">
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
            maw="100%"
            data-interestingness={formatInterestingness(item.interestingness)}
            classNames={{ root: S.pill, remove: S.pillRemove }}
            removeButtonProps={{
              mr: 0,
              "aria-hidden": false,
              "aria-label": t`Remove`,
            }}
          >
            <Ellipsified>{item.name}</Ellipsified>
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
          <Box flex={1} miw={0} mih={0} style={{ overflow: "hidden" }}>
            <Group align="flex-start" gap="sm" wrap="wrap">
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
                  maw="100%"
                  data-interestingness={formatInterestingness(
                    pickMaxInterestingness(pill.dimensions),
                  )}
                  classNames={{ root: S.pill, remove: S.pillRemove }}
                  removeButtonProps={{
                    mr: 0,
                    "aria-hidden": false,
                    "aria-label": t`Remove`,
                  }}
                >
                  <Ellipsified>{pill.name}</Ellipsified>
                </Pill>
              ))}
            </Group>
          </Box>
        </Group>
      ))}
    </Stack>
  );
}
