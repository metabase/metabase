import { useEffect, useRef, useState } from "react";
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
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { openInBlankWindow } from "metabase/utils/dom";
import { formatNumber } from "metabase/utils/formatting";
import Visualization from "metabase/visualizations/components/Visualization";

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

import S from "./InsightsPanel.module.css";

const INSIGHTS_SHOWN = 5;
const CHART_HEIGHT_PX = 240;

/** A request to bring a transition's insights into view. */
export type InsightsFocus = {
  transition: number;
  /** Distinguishes repeated requests for the same transition. */
  id: number;
};

type InsightsPanelProps = {
  insights: FunnelInsights;
  focus: InsightsFocus | undefined;
};

export const InsightsPanel = ({ insights, focus }: InsightsPanelProps) => (
  <Paper withBorder p="lg" style={{ flexShrink: 0 }} aria-label={t`Insights`}>
    <Stack gap="lg">
      <Title order={4}>{t`Insights`}</Title>
      <InsightsPanelBody
        state={insights.state}
        focus={focus}
        getExplore={insights.getExplore}
      />
    </Stack>
  </Paper>
);

type InsightsPanelBodyProps = {
  state: FunnelInsightsState;
  focus: InsightsFocus | undefined;
  getExplore: FunnelInsights["getExplore"];
};

const InsightsPanelBody = ({
  state,
  focus,
  getExplore,
}: InsightsPanelBodyProps) => {
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
      return (
        <InsightsList state={state} focus={focus} getExplore={getExplore} />
      );
  }
};

type InsightsListProps = Omit<InsightsPanelBodyProps, "state"> & {
  state: Extract<FunnelInsightsState, { status: "done" }>;
};

const InsightsList = ({ state, focus, getExplore }: InsightsListProps) => {
  const { insights, attributes, transitions, isFindingPairs, pairsError } =
    state;
  if (attributes.length === 0) {
    return (
      <Text c="text-secondary">{t`There are no columns with few enough distinct values to compare people by.`}</Text>
    );
  }
  const isNothingFound =
    insights.length === 0 && !isFindingPairs && pairsError === undefined;
  if (isNothingFound) {
    const people = formatNumber(transitions[0]?.reached ?? 0);
    return (
      <Text c="text-secondary">
        {c("{0} is a number of columns, {1} is a number of people")
          .t`Nothing stands out. Checked ${attributes.length} columns across ${people} people.`}
      </Text>
    );
  }
  return (
    <Stack gap="xl">
      {transitions.map((transition) => (
        <TransitionInsights
          key={transition.transition}
          transition={transition}
          insights={insights.filter(
            (insight) => insight.transition === transition.transition,
          )}
          attributes={attributes}
          focusId={
            focus?.transition === transition.transition ? focus.id : undefined
          }
          getExplore={getExplore}
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
  /** Set while this transition has been asked to come into view. */
  focusId: number | undefined;
  getExplore: FunnelInsights["getExplore"];
};

const TransitionInsights = ({
  transition,
  insights,
  attributes,
  focusId,
  getExplore,
}: TransitionInsightsProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const shown = isExpanded ? insights : insights.slice(0, INSIGHTS_SHOWN);
  const hiddenCount = insights.length - shown.length;

  useEffect(() => {
    if (focusId !== undefined) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusId]);

  return (
    <Stack ref={ref} gap="md" className={S.transition}>
      {focusId !== undefined && (
        <div key={focusId} className={S.highlight} aria-hidden />
      )}
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
              getExplore={getExplore}
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
    <Group justify="space-between" align="flex-end" wrap="nowrap" gap="md">
      <Stack gap={2} miw={0}>
        <Text size="sm" c="text-secondary">
          {c("{0} and {1} are funnel step numbers")
            .t`Step ${transition.transition} → ${transition.transition + 1}`}
        </Text>
        <Title order={5}>
          <Group component="span" gap="sm">
            <span>{transition.from}</span>
            <Icon name="arrow_right" c="text-secondary" aria-hidden />
            <span>{transition.to}</span>
          </Group>
        </Title>
      </Stack>
      <Text c="text-secondary" style={{ flexShrink: 0 }}>
        {c("{0} is a percentage").t`${rate} converted`}
      </Text>
    </Group>
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
  getExplore: FunnelInsights["getExplore"];
};

const InsightItem = ({
  insight,
  attributes,
  isOpen,
  getExplore,
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
        <Group component="span" gap="xs">
          <Text component="span" fw="bold">
            {title}
          </Text>
          <Text component="span" c={isHigher ? "success" : "error"}>
            {describeLift(insight)}
          </Text>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        {isOpen && <InsightDetails insight={insight} getExplore={getExplore} />}
      </Accordion.Panel>
    </Accordion.Item>
  );
};

type InsightDetailsProps = {
  insight: Insight;
  getExplore: FunnelInsights["getExplore"];
};

const InsightDetails = ({ insight, getExplore }: InsightDetailsProps) => {
  const explore = getExplore(insight);
  const rate = formatRate(insight.rate);
  const restRate = formatRate(insight.restRate);
  const people = formatNumber(insight.reached);

  return (
    <Stack gap="md" pt="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} miw={0}>
          <Text size="sm" c="text-secondary">
            {c("{0} and {1} are percentages, {2} is a number of people")
              .t`${rate} converted vs. ${restRate} of everyone else · ${people} people`}
          </Text>
          <Text size="sm" c="text-secondary">
            {describeExcess(insight)}
          </Text>
        </Stack>
        {explore !== undefined && (
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<Icon name="external" />}
            style={{ flexShrink: 0 }}
            onClick={() =>
              openInBlankWindow(Urls.serializedQuestion(explore.card))
            }
          >
            {t`Explore`}
          </Button>
        )}
      </Group>
      {explore !== undefined && (
        <Box h={CHART_HEIGHT_PX}>
          <Visualization
            rawSeries={[explore.series]}
            isQueryBuilder={false}
            onChangeCardAndRun={noop}
          />
        </Box>
      )}
    </Stack>
  );
};
