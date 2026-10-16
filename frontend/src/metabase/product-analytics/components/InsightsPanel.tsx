import { useState } from "react";
import { c, t } from "ttag";
import { noop } from "underscore";

import {
  Accordion,
  Alert,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";
import Visualization from "metabase/visualizations/components/Visualization";
import type { IconName } from "metabase-types/api";

import { CONVERSION_FORMAT } from "../analyses/series-settings";
import { describeExcess, describeLift } from "../insights/describe";
import { isDescending } from "../insights/segments";
import type { Insight, InsightAttribute } from "../insights/types";
import type {
  FunnelInsights,
  FunnelInsightsState,
  FunnelTransition,
} from "../insights/use-funnel-insights";
import { NOT_SET_VALUE } from "../sql/analyses/funnel-insights";

const INSIGHTS_SHOWN = 5;
const CHART_HEIGHT_PX = 220;

/** What each insight's button does. */
export type InsightAction = {
  label: string;
  icon: IconName;
  onClick: (insight: Insight) => void;
};

type InsightsPanelProps = {
  state: FunnelInsightsState;
  action: InsightAction;
  getExploreSeries: FunnelInsights["getExploreSeries"];
  /** Only this transition's insights are shown, when set. */
  transitionFilter?: number;
  onShowAll: () => void;
};

/** The insights for each funnel transition, or why there are none yet. */
export const InsightsPanel = ({ state, ...props }: InsightsPanelProps) => {
  switch (state.status) {
    case "idle":
      return (
        <Text c="text-secondary">{t`Finish setting up the funnel to see insights.`}</Text>
      );
    case "loading":
      return (
        <Group gap="sm" wrap="nowrap">
          <Loader size="xs" />
          <Text c="text-secondary">{t`Looking for what's different about people who convert…`}</Text>
        </Group>
      );
    case "error":
      return <Alert color="error">{state.error}</Alert>;
    case "done":
      return <InsightsList state={state} {...props} />;
  }
};

type InsightsListProps = Omit<InsightsPanelProps, "state"> & {
  state: Extract<FunnelInsightsState, { status: "done" }>;
};

const InsightsList = ({
  state,
  action,
  getExploreSeries,
  transitionFilter,
  onShowAll,
}: InsightsListProps) => {
  const { insights, attributes, transitions, isFindingPairs, pairsError } =
    state;
  if (attributes.length === 0) {
    return (
      <Text c="text-secondary">{t`There are no columns with few enough distinct values to compare people by.`}</Text>
    );
  }
  const isFiltered = transitionFilter !== undefined;
  const isNothingFound =
    !isFiltered &&
    insights.length === 0 &&
    !isFindingPairs &&
    pairsError === undefined;
  if (isNothingFound) {
    const people = formatNumber(transitions[0]?.reached ?? 0);
    return (
      <Text c="text-secondary">
        {c("{0} is a number of columns, {1} is a number of people")
          .t`Nothing stands out. Checked ${attributes.length} columns across ${people} people.`}
      </Text>
    );
  }
  const shownTransitions = isFiltered
    ? transitions.filter(({ transition }) => transition === transitionFilter)
    : transitions;

  return (
    <Stack gap="xl">
      {isFiltered && (
        <Box>
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<Icon name="arrow_left" />}
            onClick={onShowAll}
          >
            {t`All insights`}
          </Button>
        </Box>
      )}
      {isFiltered && shownTransitions.length === 0 && (
        <Text c="text-secondary">{t`No one reached this step.`}</Text>
      )}
      {shownTransitions.map((transition) => (
        <TransitionInsights
          key={transition.transition}
          transition={transition}
          insights={insights.filter(
            (insight) => insight.transition === transition.transition,
          )}
          attributes={attributes}
          isExpandedByDefault={isFiltered}
          action={action}
          getExploreSeries={getExploreSeries}
        />
      ))}
      {isFindingPairs && (
        <Group gap="sm" wrap="nowrap">
          <Loader size="xs" />
          <Text
            size="sm"
            c="text-secondary"
          >{t`Looking for combinations…`}</Text>
        </Group>
      )}
      {pairsError !== undefined && (
        <Text size="sm" c="text-secondary">
          {t`Combinations couldn't be checked: ${pairsError}`}
        </Text>
      )}
    </Stack>
  );
};

const formatRate = (rate: number) => formatNumber(rate, CONVERSION_FORMAT);

const insightKey = (insight: Insight) => JSON.stringify(insight.conditions);

type TransitionInsightsProps = {
  transition: FunnelTransition;
  insights: Insight[];
  attributes: InsightAttribute[];
  isExpandedByDefault: boolean;
  action: InsightAction;
  getExploreSeries: FunnelInsights["getExploreSeries"];
};

const TransitionInsights = ({
  transition,
  insights,
  attributes,
  isExpandedByDefault,
  action,
  getExploreSeries,
}: TransitionInsightsProps) => {
  const [isExpanded, setIsExpanded] = useState(isExpandedByDefault);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const shown = isExpanded ? insights : insights.slice(0, INSIGHTS_SHOWN);
  const hiddenCount = insights.length - shown.length;

  return (
    <Stack gap="md">
      <TransitionHeading transition={transition} />
      {insights.length === 0 ? (
        <Text size="sm" c="text-secondary">{t`Nothing stands out.`}</Text>
      ) : (
        <Accordion multiple value={openKeys} onChange={setOpenKeys}>
          {shown.map((insight) => (
            <InsightItem
              key={insightKey(insight)}
              insight={insight}
              attributes={attributes}
              isOpen={openKeys.includes(insightKey(insight))}
              action={action}
              getExploreSeries={getExploreSeries}
            />
          ))}
        </Accordion>
      )}
      {hiddenCount > 0 && (
        <Box>
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => setIsExpanded(true)}
          >
            {t`Show ${hiddenCount} more`}
          </Button>
        </Box>
      )}
    </Stack>
  );
};

const TransitionHeading = ({
  transition,
}: {
  transition: FunnelTransition;
}) => {
  const rate = formatRate(
    transition.reached > 0 ? transition.converted / transition.reached : 0,
  );
  return (
    <Stack gap={2}>
      <Text size="sm" c="text-secondary">
        {c("{0} and {1} are funnel step numbers, {2} is a percentage")
          .t`Step ${transition.transition} → ${transition.transition + 1} · ${rate} converted`}
      </Text>
      <Title order={5}>
        <Group component="span" gap="xs">
          <span>{transition.from}</span>
          <Icon name="arrow_right" c="text-secondary" aria-hidden />
          <span>{transition.to}</span>
        </Group>
      </Title>
    </Stack>
  );
};

const describeCondition = (
  attribute: InsightAttribute | undefined,
  value: string,
): string => {
  const name = attribute?.displayName ?? t`Unknown column`;
  return value === NOT_SET_VALUE
    ? c("{0} is a column name").t`${name} is not set`
    : c("{0} is a column name, {1} is one of its values")
        .t`${name} is ${value}`;
};

type InsightItemProps = {
  insight: Insight;
  attributes: InsightAttribute[];
  isOpen: boolean;
  action: InsightAction;
  getExploreSeries: FunnelInsights["getExploreSeries"];
};

const InsightItem = ({
  insight,
  attributes,
  isOpen,
  action,
  getExploreSeries,
}: InsightItemProps) => {
  const isHigher = isDescending(insight);
  const title = insight.conditions
    .map(({ attributeId, value }) =>
      describeCondition(
        attributes.find(({ id }) => id === attributeId),
        value,
      ),
    )
    .join(t` and `);

  return (
    <Accordion.Item value={insightKey(insight)}>
      <Accordion.Control
        icon={
          <Icon
            name={isHigher ? "arrow_up" : "arrow_down"}
            c={isHigher ? "success" : "error"}
            aria-hidden
          />
        }
      >
        <Stack gap={2}>
          <Text component="span" fw="bold">
            {title}
          </Text>
          <Text component="span" size="sm" c={isHigher ? "success" : "error"}>
            {describeLift(insight)}
          </Text>
        </Stack>
      </Accordion.Control>
      <Accordion.Panel>
        {isOpen && (
          <InsightDetails
            insight={insight}
            action={action}
            getExploreSeries={getExploreSeries}
          />
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
};

type InsightDetailsProps = {
  insight: Insight;
  action: InsightAction;
  getExploreSeries: FunnelInsights["getExploreSeries"];
};

const InsightDetails = ({
  insight,
  action,
  getExploreSeries,
}: InsightDetailsProps) => {
  const series = getExploreSeries(insight);
  const rate = formatRate(insight.rate);
  const restRate = formatRate(insight.restRate);
  const people = formatNumber(insight.reached);

  return (
    <Stack gap="md" pt="xs">
      <Stack gap={2}>
        <Text size="sm" c="text-secondary">
          {c("{0} and {1} are percentages, {2} is a number of people")
            .t`${rate} converted vs. ${restRate} of everyone else · ${people} people`}
        </Text>
        <Text size="sm" c="text-secondary">
          {describeExcess(insight)}
        </Text>
      </Stack>
      {series !== undefined && (
        <Box h={CHART_HEIGHT_PX}>
          <Visualization
            rawSeries={[series]}
            isQueryBuilder={false}
            onChangeCardAndRun={noop}
          />
        </Box>
      )}
      <Box>
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<Icon name={action.icon} />}
          onClick={() => action.onClick(insight)}
        >
          {action.label}
        </Button>
      </Box>
    </Stack>
  );
};
