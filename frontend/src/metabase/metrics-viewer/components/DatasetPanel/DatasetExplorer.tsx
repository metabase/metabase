import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  SummarizeBreakoutColumnList,
  // Prototype: reuse the existing summary controls until they move into querying.
  // eslint-disable-next-line boundaries/element-types
} from "metabase/query_builder";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import { FilterPanel } from "metabase/querying/filters/components/FilterPanel";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType, IconName } from "metabase-types/api";

import { useSummaryResult } from "../../pages/QuestionSummaryPage/use-summary-result";
import { initializeTableSummary } from "../../utils/table-formula";

import S from "./DatasetExplorer.module.css";
import { TableFormulaBar } from "./TableFormulaBar";

type DisplayOption = { value: CardDisplayType; label: string; icon: IconName };

const getDisplayOptions = (): DisplayOption[] => [
  { value: "table", label: t`Table`, icon: "table2" },
  { value: "pivot", label: t`Pivot table`, icon: "pivot_table" },
  { value: "scalar", label: t`Number`, icon: "number" },
  { value: "bar", label: t`Bar`, icon: "bar" },
  { value: "line", label: t`Line`, icon: "line" },
  { value: "area", label: t`Area`, icon: "area" },
];

/**
 * Summarizes an ad hoc table question through a formula bar, with grouping,
 * filters, and a chart picker that all apply to the same query.
 */
export function DatasetExplorer({
  initialQuestion,
  returnTo,
  onChange,
}: {
  initialQuestion: Question;
  returnTo: string | null;
  onChange: (question: Question) => void;
}) {
  const [question, setQuestion] = useState(() =>
    initializeTableSummary(initialQuestion),
  );
  const [isAddingCalculation, setIsAddingCalculation] = useState(false);
  const query = question.query();
  const aggregations = Lib.aggregations(query, -1);
  const canRun = Lib.canRun(query, question.type());
  const { result, error, isRunning, refresh, cancel } = useSummaryResult(
    question,
    canRun,
  );

  const updateQuestion = (nextQuestion: Question) => {
    setQuestion(nextQuestion);
    onChange(nextQuestion);
  };
  const updateQuery = (nextQuery: Lib.Query) =>
    updateQuestion(question.setQuery(nextQuery));

  return (
    <Stack h="100%" px="xl" py="md" gap="lg" data-testid="question-summary">
      <ExplorerHeader
        question={question}
        returnTo={returnTo}
        onQueryChange={updateQuery}
      />
      <Box className={S.formulaPanel}>
        {aggregations.map((aggregation, index) => (
          <TableFormulaBar
            key={index}
            query={query}
            aggregationIndex={index}
            onChange={updateQuery}
            onRemove={
              aggregations.length > 1
                ? () => updateQuery(Lib.removeClause(query, -1, aggregation))
                : undefined
            }
          />
        ))}
        {isAddingCalculation ? (
          <TableFormulaBar
            query={query}
            aggregationIndex={aggregations.length}
            autoFocus
            onChange={(nextQuery) => {
              setIsAddingCalculation(false);
              updateQuery(nextQuery);
            }}
            onRemove={() => setIsAddingCalculation(false)}
          />
        ) : (
          <UnstyledButton
            className={S.addCalculation}
            onClick={() => setIsAddingCalculation(true)}
          >
            <Group gap="sm" wrap="nowrap">
              <Icon name="add" aria-hidden />
              <Text c="inherit">{t`Add calculation`}</Text>
            </Group>
          </UnstyledButton>
        )}
        <FilterPanel
          className={S.filters}
          query={query}
          onChange={updateQuery}
        />
      </Box>
      <Box className={S.result}>
        {!canRun ? (
          <Flex h="100%" align="center" justify="center">
            <Text c="text-secondary">{t`Enter a formula to see your summary.`}</Text>
          </Flex>
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
      <Box className={S.controls} pb="xs">
        <ChartTypePicker
          value={question.display()}
          onChange={(display) => updateQuestion(question.setDisplay(display))}
        />
        <GroupByControl query={query} onQueryChange={updateQuery} />
        <Group justify="flex-end">
          {isRunning ? (
            <Button size="compact-sm" variant="subtle" onClick={cancel}>
              {t`Cancel`}
            </Button>
          ) : (
            <Tooltip label={t`Refresh`}>
              <ActionIcon
                variant="subtle"
                aria-label={t`Refresh`}
                disabled={!canRun}
                onClick={refresh}
              >
                <Icon name="refresh" />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Box>
    </Stack>
  );
}

function ExplorerHeader({
  question,
  returnTo,
  onQueryChange,
}: {
  question: Question;
  returnTo: string | null;
  onQueryChange: (query: Lib.Query) => void;
}) {
  const [filterOpened, setFilterOpened] = useState(false);
  const query = question.query();
  const sourceName = getSourceName(query);

  return (
    <Flex align="center" justify="space-between" gap="md" wrap="wrap">
      <Group gap="sm" wrap="nowrap" miw={0}>
        {returnTo && (
          <Tooltip label={t`Back to table`}>
            <ActionIcon
              component={ForwardRefLink}
              to={returnTo}
              variant="subtle"
              size="lg"
              aria-label={t`Back to table`}
            >
              <Icon name="arrow_left" />
            </ActionIcon>
          </Tooltip>
        )}
        <Text fw={700} size="lg" component="h1">
          {t`Explore`}
        </Text>
        {sourceName && (
          <Group gap="xs" wrap="nowrap" miw={0}>
            <Icon name="table" c="text-secondary" size={14} aria-hidden />
            <Text c="text-secondary" truncate>
              {sourceName}
            </Text>
          </Group>
        )}
      </Group>
      <Group gap="sm">
        <Popover
          opened={filterOpened}
          onDismiss={() => setFilterOpened(false)}
          position="bottom-end"
        >
          <Popover.Target>
            <Button
              variant="light"
              color="filter"
              leftSection={<Icon name="filter" size={16} aria-hidden />}
              onClick={() => setFilterOpened(!filterOpened)}
            >
              {t`Filter`}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <MultiStageFilterPicker
              canAppendStage={question.display() !== "pivot"}
              query={query}
              onChange={onQueryChange}
              onClose={() => setFilterOpened(false)}
            />
          </Popover.Dropdown>
        </Popover>
        <Button
          component={Link}
          to={Urls.serializedQuestion(question.cardWithNormalizedQuery(), {
            parameterValues: question._parameterValues,
            includeDisplayIsLocked: true,
          })}
        >{t`Open as question`}</Button>
      </Group>
    </Flex>
  );
}

function ChartTypePicker({
  value,
  onChange,
}: {
  value: CardDisplayType;
  onChange: (display: CardDisplayType) => void;
}) {
  return (
    <Flex
      className={S.chartPicker}
      gap="xxs"
      bg="background_page-secondary"
      p="xxs"
      bdrs="sm"
      w="fit-content"
    >
      {getDisplayOptions().map((option) => {
        const isSelected = option.value === value;
        return (
          <Tooltip key={option.value} label={option.label}>
            <ActionIcon
              w="2rem"
              h="1.5rem"
              variant={isSelected ? "filled" : "subtle"}
              bg={isSelected ? "background_page-primary" : undefined}
              className={isSelected ? S.chartSelected : undefined}
              aria-label={option.label}
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
            >
              <Icon
                name={option.icon}
                c={isSelected ? "core-brand" : "text-primary"}
              />
            </ActionIcon>
          </Tooltip>
        );
      })}
    </Flex>
  );
}

function GroupByControl({
  query,
  onQueryChange,
}: {
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
}) {
  const [opened, setOpened] = useState(false);
  const breakoutNames = Lib.breakouts(query, -1).map(
    (breakout) => Lib.displayInfo(query, -1, breakout).displayName,
  );

  return (
    <Popover opened={opened} onDismiss={() => setOpened(false)} position="top">
      <Popover.Target>
        <UnstyledButton
          className={S.groupButton}
          onClick={() => setOpened(!opened)}
        >
          <Group gap="sm" wrap="nowrap">
            <Icon name="group" c="text-secondary" aria-hidden />
            <Text fw={700} truncate maw="24rem">
              {breakoutNames.length > 0
                ? breakoutNames.join(", ")
                : t`Group by`}
            </Text>
            <Icon name="chevrondown" size={12} aria-hidden />
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Box w="20rem" p="md" mah="24rem" style={{ overflowY: "auto" }}>
          <SummarizeBreakoutColumnList
            query={query}
            stageIndex={-1}
            onQueryChange={onQueryChange}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}

function getSourceName(query: Lib.Query): string | null {
  const sourceId = Lib.sourceTableOrCardId(query);
  const metadata = sourceId != null && Lib.tableOrCardMetadata(query, sourceId);
  return metadata ? Lib.displayInfo(query, -1, metadata).displayName : null;
}
