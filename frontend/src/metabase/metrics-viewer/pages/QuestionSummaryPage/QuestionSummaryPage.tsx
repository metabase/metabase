import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getQuestionReturnUrl } from "metabase/common/metrics-viewer/question-handoff";
import {
  getSummaryUrl,
  restoreSummaryParameters,
} from "metabase/common/metrics-viewer/question-summary";
import {
  SummarizeAggregationItemList,
  SummarizeBreakoutColumnList,
  // Prototype: reuse the existing summary controls until they move into querying.
  // eslint-disable-next-line boundaries/element-types
} from "metabase/query_builder";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import { FilterPanel } from "metabase/querying/filters/components/FilterPanel";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import { AdHocQuestionLoader } from "metabase/questions/components/AdHocQuestionLoader";
import { useLocation, useNavigate } from "metabase/router";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Popover,
  Select,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType } from "metabase-types/api";

import { useSummaryResult } from "./use-summary-result";

export function QuestionSummaryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = getQuestionReturnUrl(location.search);
  const [loadHash, setLoadHash] = useState(location.hash);
  const lastHash = useRef(location.hash);

  useEffect(() => {
    if (location.hash !== lastHash.current) {
      lastHash.current = location.hash;
      setLoadHash(location.hash);
    }
  }, [location.hash]);

  const handleChange = (question: Question) => {
    const url = getSummaryUrl(question, returnTo ?? "");
    lastHash.current = url.slice(url.indexOf("#"));
    navigate(url, { replace: true });
  };

  return (
    <Stack h="100%" p="lg" gap="md">
      <Group justify="space-between">
        <Title order={2}>{t`Explore summary`}</Title>
        {returnTo && (
          <Button
            component={Link}
            to={returnTo}
            leftSection={<Icon name="arrow_left" aria-hidden />}
          >{t`Back to table`}</Button>
        )}
      </Group>
      <AdHocQuestionLoader questionHash={loadHash}>
        {({ question, loading, error }) => (
          <LoadingAndErrorWrapper loading={loading} error={error} noWrapper>
            {question ? (
              <QuestionSummary
                key={loadHash}
                initialQuestion={restoreSummaryParameters(question)}
                onChange={handleChange}
              />
            ) : (
              <Text>{t`Open a table question to explore a summary.`}</Text>
            )}
          </LoadingAndErrorWrapper>
        )}
      </AdHocQuestionLoader>
    </Stack>
  );
}

export function QuestionSummary({
  initialQuestion,
  onChange,
}: {
  initialQuestion: Question;
  onChange: (question: Question) => void;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [filterOpened, setFilterOpened] = useState(false);
  const query = question.query();
  const hasAggregations = Lib.stageIndexes(query).some(
    (stage) => Lib.aggregations(query, stage).length > 0,
  );
  const canRun = hasAggregations && Lib.canRun(query, question.type());
  const { result, error, isRunning, refresh, cancel } = useSummaryResult(
    question,
    canRun,
  );
  const updateQuestion = (nextQuestion: Question) => {
    setQuestion(nextQuestion);
    onChange(nextQuestion);
  };
  const updateQuery = (nextQuery: Lib.Query) =>
    updateQuestion(question.setQuery(nextQuery).setDefaultDisplay());
  const displayOptions: { value: CardDisplayType; label: string }[] = [
    { value: "table", label: t`Table` },
    { value: "pivot", label: t`Pivot table` },
    { value: "scalar", label: t`Number` },
    { value: "bar", label: t`Bar` },
    { value: "line", label: t`Line` },
    { value: "area", label: t`Area` },
  ];

  return (
    <Stack flex={1} mih={0} gap="md" data-testid="question-summary">
      <Group justify="space-between">
        <Text c="text-secondary">
          {t`Summarize this question. Changes here stay separate from the original table.`}
        </Text>
        <Button
          component={Link}
          to={Urls.serializedQuestion(question.cardWithNormalizedQuery(), {
            parameterValues: question._parameterValues,
            includeDisplayIsLocked: true,
          })}
        >{t`Open as question`}</Button>
      </Group>
      <Group align="flex-start" wrap="nowrap" flex={1} mih={0}>
        <Stack
          w="20rem"
          h="100%"
          style={{ overflowY: "auto", flexShrink: 0 }}
          p="md"
          bg="background-secondary"
        >
          <Title order={4}>{t`Summarize by`}</Title>
          <SummarizeAggregationItemList
            query={query}
            stageIndex={-1}
            onQueryChange={updateQuery}
          />
          <Divider />
          <SummarizeBreakoutColumnList
            query={query}
            stageIndex={-1}
            onQueryChange={updateQuery}
          />
        </Stack>
        <Stack flex={1} h="100%" mih={0} miw={0}>
          <Group>
            <Popover
              opened={filterOpened}
              onDismiss={() => setFilterOpened(false)}
            >
              <Popover.Target>
                <Button
                  onClick={() => setFilterOpened(!filterOpened)}
                  leftSection={<Icon name="filter" aria-hidden />}
                >
                  {t`Filter`}
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <MultiStageFilterPicker
                  canAppendStage={question.display() !== "pivot"}
                  query={query}
                  onChange={updateQuery}
                  onClose={() => setFilterOpened(false)}
                />
              </Popover.Dropdown>
            </Popover>
            <Select
              aria-label={t`Visualization`}
              value={question.display()}
              data={displayOptions}
              onChange={(value) => {
                const option = displayOptions.find(
                  (option) => option.value === value,
                );
                if (option) {
                  updateQuestion(question.setDisplay(option.value));
                }
              }}
            />
            {isRunning && <Button onClick={cancel}>{t`Cancel`}</Button>}
            <Button
              disabled={!canRun || isRunning}
              onClick={refresh}
            >{t`Refresh`}</Button>
          </Group>
          <FilterPanel query={query} onChange={updateQuery} />
          <Box flex={1} mih={0} pos="relative">
            {!canRun ? (
              <Text>{t`Choose a calculation to see your summary.`}</Text>
            ) : error ? (
              <LoadingAndErrorWrapper error={error} />
            ) : (
              <QueryVisualization
                question={question}
                result={result}
                rawSeries={
                  result ? [{ card: question.card(), data: result.data }] : null
                }
                isRunning={isRunning}
                isRunnable={canRun}
                isShowingSummarySidebar
                isResultDirty={!result && !isRunning}
                onUpdateQuestion={updateQuestion}
                onUpdateVisualizationSettings={(settings) =>
                  updateQuestion(question.updateSettings(settings))
                }
                runQuestionQuery={refresh}
                cancelQuery={cancel}
              />
            )}
          </Box>
        </Stack>
      </Group>
    </Stack>
  );
}
