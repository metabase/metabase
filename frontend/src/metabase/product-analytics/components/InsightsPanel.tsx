import { useState } from "react";
import { c, t } from "ttag";

import {
  Alert,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Paper,
  Stack,
  Text,
} from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";
import type { IconName } from "metabase-types/api";

import type { Insight, InsightAttribute } from "../insights/types";
import type {
  FunnelInsightsState,
  FunnelTransition,
} from "../insights/use-funnel-insights";
import { NOT_SET_VALUE } from "../sql/analyses/funnel-insights";

const INSIGHTS_SHOWN = 5;

/** What each insight's button does. */
export type InsightAction = {
  label: string;
  icon: IconName;
  onClick: (insight: Insight) => void;
};

type InsightsPanelProps = {
  state: FunnelInsightsState;
  action: InsightAction;
};

/** The insights for each funnel transition, or why there are none yet. */
export const InsightsPanel = ({ state, action }: InsightsPanelProps) => {
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
      return <InsightsList state={state} action={action} />;
  }
};

type InsightsListProps = {
  state: Extract<FunnelInsightsState, { status: "done" }>;
  action: InsightAction;
};

const InsightsList = ({ state, action }: InsightsListProps) => {
  const { insights, attributes, transitions, isFindingPairs, pairsError } =
    state;
  if (attributes.length === 0) {
    return (
      <Text c="text-secondary">{t`There are no columns with few enough distinct values to compare people by.`}</Text>
    );
  }
  const people = transitions[0]?.reached ?? 0;
  return (
    <Stack gap="lg">
      {transitions.map((transition) => (
        <TransitionInsights
          key={transition.transition}
          transition={transition}
          insights={insights.filter(
            (insight) => insight.transition === transition.transition,
          )}
          attributes={attributes}
          action={action}
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
      <Text size="sm" c="text-secondary">
        {c("{0} is a number of columns, {1} is a number of people")
          .t`Checked ${attributes.length} columns across ${formatNumber(people)} people.`}
      </Text>
    </Stack>
  );
};

type TransitionInsightsProps = {
  transition: FunnelTransition;
  insights: Insight[];
  attributes: InsightAttribute[];
  action: InsightAction;
};

const TransitionInsights = ({
  transition,
  insights,
  attributes,
  action,
}: TransitionInsightsProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shown = isExpanded ? insights : insights.slice(0, INSIGHTS_SHOWN);
  const hiddenCount = insights.length - shown.length;
  return (
    <Stack gap="sm">
      <Text fw="bold">
        {c("{0} and {1} are funnel step names")
          .t`${transition.from} → ${transition.to}`}
      </Text>
      {insights.length === 0 && (
        <Text size="sm" c="text-secondary">{t`Nothing stands out.`}</Text>
      )}
      {shown.map((insight) => (
        <InsightCard
          key={JSON.stringify(insight.conditions)}
          insight={insight}
          attributes={attributes}
          action={action}
        />
      ))}
      {hiddenCount > 0 && (
        <Button
          variant="subtle"
          size="compact-sm"
          onClick={() => setIsExpanded(true)}
        >
          {t`Show ${hiddenCount} more`}
        </Button>
      )}
    </Stack>
  );
};

const formatRate = (rate: number) =>
  formatNumber(rate, { number_style: "percent", maximumFractionDigits: 1 });

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

type InsightCardProps = {
  insight: Insight;
  attributes: InsightAttribute[];
  action: InsightAction;
};

const InsightCard = ({ insight, attributes, action }: InsightCardProps) => {
  const isHigher = insight.rate > insight.restRate;
  const title = insight.conditions
    .map(({ attributeId, value }) =>
      describeCondition(
        attributes.find(({ id }) => id === attributeId),
        value,
      ),
    )
    .join(t` and `);
  const rate = formatRate(insight.rate);
  const restRate = formatRate(insight.restRate);
  const people = formatNumber(insight.reached);

  return (
    <Paper withBorder p="sm">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Box pt={2}>
          <Icon
            name={isHigher ? "arrow_up" : "arrow_down"}
            c={isHigher ? "success" : "error"}
            aria-label={isHigher ? t`Converts better` : t`Converts worse`}
          />
        </Box>
        <Stack gap={4} flex={1} miw={0}>
          <Text fw="bold">{title}</Text>
          <Text size="sm" c="text-secondary">
            {c("{0} and {1} are percentages, {2} is a number of people")
              .t`${rate} converted vs. ${restRate} of everyone else · ${people} people`}
          </Text>
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
      </Group>
    </Paper>
  );
};
