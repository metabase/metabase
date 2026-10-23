import { match } from "ts-pattern";
import { c, t } from "ttag";

import { useLocation } from "metabase/router";
import { Button, Card, Group, Icon, Stack, Text } from "metabase/ui";
import {
  METABOT_EVENT_ANALYSIS_SUGGESTION_EVENT,
  type MetabotEventAnalysisChange,
  type MetabotEventAnalysisSuggestion,
  type MetabotEventAnalysisSuggestionEventDetail,
} from "metabase-types/api";

const describeCondition = (
  column: string,
  operator: string,
  values: string[] | undefined,
): string => {
  const list = (values ?? []).join(", ");
  return match(operator)
    .with(
      "=",
      () => c("{0} is a column, {1} its values").t`${column} is ${list}`,
    )
    .with(
      "!=",
      () => c("{0} is a column, {1} its values").t`${column} is not ${list}`,
    )
    .with("is-empty", () => c("{0} is a column").t`${column} is empty`)
    .otherwise(() => c("{0} is a column").t`${column} is not empty`);
};

const describeChange = (change: MetabotEventAnalysisChange): string =>
  match(change)
    .with({ type: "filter" }, ({ column, operator, values }) =>
      describeCondition(column, operator, values),
    )
    .with(
      { type: "step-filter" },
      ({ step, column, operator, values }) =>
        c("{0} is a step number, {1} a condition")
          .t`Step ${step}: ${describeCondition(column, operator, values)}`,
    )
    .with({ type: "breakout" }, ({ column }) =>
      column !== null
        ? c("{0} is a column").t`Break out by ${column}`
        : t`No breakout`,
    )
    .with(
      { type: "steps" },
      ({ segments }) =>
        c("{0} is a list of steps").t`Steps: ${segments.join(" → ")}`,
    )
    .with(
      { type: "date_range" },
      ({ value }) => c("{0} is a date range").t`Date range: ${value}`,
    )
    .with(
      { type: "counting" },
      ({ value }) => c("{0} is person, session or event").t`Count ${value}s`,
    )
    .with(
      { type: "funnel.window" },
      ({ value }) =>
        c("{0} is a number, {1} a time unit")
          .t`Within ${value.value} ${value.unit}s`,
    )
    .exhaustive();

const sendToAnalysis = (
  suggestion: MetabotEventAnalysisSuggestion,
  action: MetabotEventAnalysisSuggestionEventDetail["action"],
) =>
  window.dispatchEvent(
    new CustomEvent<MetabotEventAnalysisSuggestionEventDetail>(
      METABOT_EVENT_ANALYSIS_SUGGESTION_EVENT,
      { detail: { suggestion, action } },
    ),
  );

type MetabotEventAnalysisSuggestionCardProps = {
  suggestion: MetabotEventAnalysisSuggestion;
};

/**
 * PROTOTYPE: an analysis Metabot suggests. Its buttons only work while the
 * analysis page is open, which applies the changes or opens them in a new tab.
 */
export const MetabotEventAnalysisSuggestionCard = ({
  suggestion,
}: MetabotEventAnalysisSuggestionCardProps) => {
  const location = useLocation();
  const isOnAnalysis = location.pathname.startsWith("/event-analysis");

  return (
    <Card withBorder p="md" data-testid="metabot-event-analysis-suggestion">
      <Stack gap="sm">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Icon name="funnel" c="brand" mt={2} />
          <Stack gap={2}>
            <Text fw="bold">{suggestion.title}</Text>
            <Text c="text-secondary" size="sm">
              {suggestion.why}
            </Text>
          </Stack>
        </Group>
        <Stack gap={2}>
          {suggestion.changes.map((change, index) => (
            <Text key={index} size="sm">
              {describeChange(change)}
            </Text>
          ))}
        </Stack>
        <Group gap="sm">
          <Button
            size="compact-sm"
            variant="filled"
            disabled={!isOnAnalysis}
            onClick={() => sendToAnalysis(suggestion, "apply")}
          >
            {t`Apply`}
          </Button>
          <Button
            size="compact-sm"
            leftSection={<Icon name="external" />}
            disabled={!isOnAnalysis}
            onClick={() => sendToAnalysis(suggestion, "open")}
          >
            {t`Open in new tab`}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
