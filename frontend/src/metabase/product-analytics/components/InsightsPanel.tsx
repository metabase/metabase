import { useState } from "react";
import { c, t } from "ttag";

import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";

import type { Insight, InsightAttribute } from "../insights/types";
import type {
  FunnelInsightsState,
  FunnelTransition,
} from "../insights/use-funnel-insights";
import { NOT_SET_VALUE } from "../sql/analyses/funnel-insights";

const PANEL_WIDTH = 320;
const INSIGHTS_SHOWN = 5;

type InsightsPanelProps = {
  state: FunnelInsightsState;
  onExplore: (insight: Insight) => void;
  onClose: () => void;
};

export const InsightsPanel = ({
  state,
  onExplore,
  onClose,
}: InsightsPanelProps) => (
  <Paper
    withBorder
    p="lg"
    w={PANEL_WIDTH}
    style={{ flexShrink: 0, overflowY: "auto" }}
    aria-label={t`Insights`}
  >
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <Title order={4}>{t`Insights`}</Title>
        <ActionIcon
          variant="subtle"
          aria-label={t`Close insights`}
          onClick={onClose}
        >
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <InsightsPanelBody state={state} onExplore={onExplore} />
    </Stack>
  </Paper>
);

type InsightsPanelBodyProps = Omit<InsightsPanelProps, "onClose">;

const InsightsPanelBody = ({ state, onExplore }: InsightsPanelBodyProps) => {
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
      return <InsightsList state={state} onExplore={onExplore} />;
  }
};

type InsightsListProps = {
  state: Extract<FunnelInsightsState, { status: "done" }>;
  onExplore: (insight: Insight) => void;
};

const InsightsList = ({ state, onExplore }: InsightsListProps) => {
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
          onExplore={onExplore}
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
  onExplore: (insight: Insight) => void;
};

const TransitionInsights = ({
  transition,
  insights,
  attributes,
  onExplore,
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
          onExplore={onExplore}
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
  onExplore: (insight: Insight) => void;
};

const InsightCard = ({ insight, attributes, onExplore }: InsightCardProps) => {
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
              leftSection={<Icon name="external" />}
              onClick={() => onExplore(insight)}
            >
              {t`Explore`}
            </Button>
          </Box>
        </Stack>
      </Group>
    </Paper>
  );
};
