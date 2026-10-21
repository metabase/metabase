import { Fragment, useEffect, useRef, useState } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import {
  Accordion,
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
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { openInBlankWindow } from "metabase/utils/dom";
import { formatNumber } from "metabase/utils/formatting";
import Visualization from "metabase/visualizations/components/Visualization";

import { CONVERSION_FORMAT } from "../../analyses/series-settings";
import {
  describeAttribute,
  describeCondition,
  describeExcess,
  describeLift,
} from "../../insights/describe";
import type { InsightOutcome } from "../../insights/outcomes";
import { isDescending } from "../../insights/segments";
import type {
  Insight,
  InsightAttribute,
  InsightQuestion,
} from "../../insights/types";
import type { Insights, InsightsState } from "../../insights/use-insights";

import S from "./InsightsPanel.module.css";

const INSIGHTS_SHOWN = 5;
const CHART_HEIGHT_PX = 240;

/** A request to bring a question's insights into view. */
export type InsightsFocus = {
  question: number;
  /** Distinguishes repeated requests for the same question. */
  id: number;
};

type InsightsPanelProps = {
  insights: Insights;
  focus: InsightsFocus | undefined;
  /** Shown while the analysis isn't set up enough for insights. */
  idleLabel: string;
  /** A chart's insights button is hovered. */
  isHinted?: boolean;
  onClose: () => void;
};

/** The side panel on the right that each chart's insights button toggles. */
export const InsightsPanel = ({
  insights,
  focus,
  idleLabel,
  isHinted = false,
  onClose,
}: InsightsPanelProps) => (
  <Paper
    component="aside"
    withBorder
    radius="md"
    className={S.panel}
    data-hinted={isHinted}
    aria-label={t`Insights`}
  >
    <Group
      justify="space-between"
      wrap="nowrap"
      px="xl"
      pt="lg"
      pb="md"
      className={S.header}
    >
      <Group gap="sm" wrap="nowrap">
        <Icon name="insight" c="text-secondary" />
        <Title order={4}>{t`Insights`}</Title>
      </Group>
      <ActionIcon aria-label={t`Close insights`} onClick={onClose}>
        <Icon name="close" />
      </ActionIcon>
    </Group>
    <Box px="xl" pt="md" pb="xl" className={S.body}>
      <InsightsPanelBody
        state={insights.state}
        outcome={insights.outcome}
        focus={focus}
        idleLabel={idleLabel}
        getExplore={insights.getExplore}
      />
    </Box>
  </Paper>
);

type InsightsPanelBodyProps = {
  state: InsightsState;
  /** Undefined while idle. */
  outcome: InsightOutcome | undefined;
  focus: InsightsFocus | undefined;
  idleLabel: string;
  getExplore: Insights["getExplore"];
};

const InsightsPanelBody = ({
  state,
  outcome,
  focus,
  idleLabel,
  getExplore,
}: InsightsPanelBodyProps) => {
  if (state.status === "idle" || outcome === undefined) {
    return <Text c="text-secondary">{idleLabel}</Text>;
  }
  switch (state.status) {
    case "loading":
      return (
        <Group gap="sm" wrap="nowrap">
          <Loader size="xs" />
          <Text c="text-secondary">{outcome.searchingLabel}</Text>
        </Group>
      );
    case "error":
      return <Alert color="error">{state.error}</Alert>;
    case "done":
      return (
        <InsightsList
          state={state}
          outcome={outcome}
          focus={focus}
          getExplore={getExplore}
        />
      );
  }
};

type InsightsListProps = {
  state: Extract<InsightsState, { status: "done" }>;
  outcome: InsightOutcome;
  focus: InsightsFocus | undefined;
  getExplore: Insights["getExplore"];
};

const InsightsList = ({
  state,
  outcome,
  focus,
  getExplore,
}: InsightsListProps) => {
  const {
    insights,
    attributes,
    questions,
    checkedCount,
    pairsFor,
    isFindingPairs,
    pairsError,
  } = state;
  if (attributes.length === 0) {
    return <Text c="text-secondary">{outcome.noAttributesLabel}</Text>;
  }
  const isNothingFound =
    insights.length === 0 && !isFindingPairs && pairsError === undefined;
  if (isNothingFound) {
    return (
      <Text c="text-secondary">
        {outcome.describeNothingFound(
          attributes.length,
          formatNumber(checkedCount),
        )}
      </Text>
    );
  }
  return (
    <Stack gap="xl">
      {questions.map((question) => (
        <QuestionInsights
          key={question.question}
          question={question}
          insights={insights.filter(
            (insight) => insight.question === question.question,
          )}
          attributes={attributes}
          outcome={outcome}
          focusId={focus?.question === question.question ? focus.id : undefined}
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
          {pairsFor === "search"
            ? t`Combinations couldn't be checked: ${pairsError}`
            : t`Couldn't check which insights overlap, so some may say the same thing: ${pairsError}`}
        </Text>
      )}
    </Stack>
  );
};

const formatRate = (rate: number) => formatNumber(rate, CONVERSION_FORMAT);

const insightKey = (insight: Insight) => JSON.stringify(insight.conditions);

type QuestionInsightsProps = {
  question: InsightQuestion;
  insights: Insight[];
  attributes: InsightAttribute[];
  outcome: InsightOutcome;
  /** Set while this question has been asked to come into view. */
  focusId: number | undefined;
  getExplore: Insights["getExplore"];
};

const QuestionInsights = ({
  question,
  insights,
  attributes,
  outcome,
  focusId,
  getExplore,
}: QuestionInsightsProps) => {
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
    <Stack ref={ref} gap="md" className={S.question}>
      {focusId !== undefined && (
        <div key={focusId} className={S.highlight} aria-hidden />
      )}
      <QuestionHeading question={question} outcome={outcome} />
      {insights.length === 0 ? (
        <Text size="sm" c="text-secondary">{t`Nothing stands out.`}</Text>
      ) : (
        <Accordion multiple value={openKeys} onChange={setOpenKeys}>
          {shown.map((insight) => (
            <InsightItem
              key={insightKey(insight)}
              insight={insight}
              attributes={attributes}
              outcome={outcome}
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

type QuestionHeadingProps = {
  question: InsightQuestion;
  outcome: InsightOutcome;
};

const QuestionHeading = ({ question, outcome }: QuestionHeadingProps) => {
  const rate = formatRate(
    question.reached > 0 ? question.converted / question.reached : 0,
  );
  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap" gap="md">
      <Stack gap={2} miw={0}>
        {question.caption && (
          <Text size="sm" c="text-secondary">
            {question.caption}
          </Text>
        )}
        <Title order={5}>
          <Group component="span" gap="sm">
            {question.labels.map((label, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <Icon name="arrow_right" c="text-secondary" aria-hidden />
                )}
                <span>{label}</span>
              </Fragment>
            ))}
          </Group>
        </Title>
      </Stack>
      <Text c="text-secondary" style={{ flexShrink: 0 }}>
        {outcome.describeRate(rate)}
      </Text>
    </Group>
  );
};

type InsightItemProps = {
  insight: Insight;
  attributes: InsightAttribute[];
  outcome: InsightOutcome;
  isOpen: boolean;
  getExplore: Insights["getExplore"];
};

const InsightItem = ({
  insight,
  attributes,
  outcome,
  isOpen,
  getExplore,
}: InsightItemProps) => {
  const isHigher = isDescending(insight);
  const isBetter = isHigher === outcome.isHigherBetter;
  const conditions = insight.conditions.map(({ attributeId, value }) => ({
    attribute: attributes.find(({ id }) => id === attributeId),
    value,
  }));
  const title = conditions
    .map(({ attribute, value }) => describeCondition(attribute, value))
    .join(t` and `);
  const explanation = conditions
    .flatMap(({ attribute }) => describeAttribute(attribute) ?? [])
    .join(" ");

  return (
    <Accordion.Item value={insightKey(insight)}>
      <Accordion.Control
        icon={
          <Icon
            name={isHigher ? "arrow_up" : "arrow_down"}
            c={isBetter ? "success" : "error"}
            aria-hidden
          />
        }
      >
        <Group component="span" gap="xs">
          <Text component="span" fw="bold">
            {title}
          </Text>
          {explanation !== "" && (
            <Tooltip label={explanation} multiline maw={280}>
              <Icon name="info" c="text-secondary" />
            </Tooltip>
          )}
          <Text component="span" c={isBetter ? "success" : "error"}>
            {describeLift(insight, outcome)}
          </Text>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        {isOpen && (
          <InsightDetails
            insight={insight}
            outcome={outcome}
            getExplore={getExplore}
          />
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
};

type InsightDetailsProps = {
  insight: Insight;
  outcome: InsightOutcome;
  getExplore: Insights["getExplore"];
};

const InsightDetails = ({
  insight,
  outcome,
  getExplore,
}: InsightDetailsProps) => {
  const explore = getExplore(insight);
  const rate = formatRate(insight.rate);
  const restRate = formatRate(insight.restRate);
  const size = formatNumber(insight.reached);

  return (
    <Stack gap="md" pt="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} miw={0}>
          <Text size="sm" c="text-secondary">
            {outcome.describeComparison(rate, restRate, size)}
          </Text>
          <Text size="sm" c="text-secondary">
            {describeExcess(insight, outcome)}
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
