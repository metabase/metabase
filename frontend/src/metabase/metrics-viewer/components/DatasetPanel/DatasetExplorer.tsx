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
  SegmentedControl,
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
import { FormulaSuggestions } from "./FormulaSuggestions";
import { ResultSkeleton } from "./ResultSkeleton";
import { TableFormulaBar } from "./TableFormulaBar";

type FormulaBarVariant = "single" | "row";

const FORMULA_BAR_VARIANT_KEY = "metabase-excel-mode-formula-bar";

function readFormulaBarVariant(): FormulaBarVariant {
  try {
    return localStorage.getItem(FORMULA_BAR_VARIANT_KEY) === "row"
      ? "row"
      : "single";
  } catch {
    return "single";
  }
}

/** Prototype toggle between one shared formula bar and a bar per calculation. */
function useFormulaBarVariant() {
  const [variant, setVariant] = useState(readFormulaBarVariant);
  const update = (nextVariant: FormulaBarVariant) => {
    setVariant(nextVariant);
    try {
      localStorage.setItem(FORMULA_BAR_VARIANT_KEY, nextVariant);
    } catch {
      // Storage can be unavailable; the toggle still works for this session.
    }
  };
  return [variant, update] as const;
}

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
  const [barVariant, setBarVariant] = useFormulaBarVariant();
  const query = question.query();
  const aggregations = Lib.aggregations(query, -1);
  const hasGrouping = Lib.breakouts(query, -1).length > 0;
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
        barVariant={barVariant}
        onBarVariantChange={setBarVariant}
        onQueryChange={updateQuery}
      />
      <Stack gap="sm">
        <Box className={S.formulaPanel}>
          {barVariant === "single" ? (
            <TableFormulaBar
              variant="single"
              query={query}
              onChange={updateQuery}
            />
          ) : (
            <RowFormulaBars
              query={query}
              aggregations={aggregations}
              isAddingCalculation={isAddingCalculation}
              onAddingCalculationChange={setIsAddingCalculation}
              onQueryChange={updateQuery}
            />
          )}
          <FilterPanel
            className={S.filters}
            query={query}
            onChange={updateQuery}
          />
        </Box>
        <FormulaSuggestions query={query} onChange={updateQuery} />
      </Stack>
      <Box className={S.result}>
        {!canRun ? (
          <Flex h="100%" align="center" justify="center">
            <Text c="text-secondary">{t`Enter a formula to see your summary.`}</Text>
          </Flex>
        ) : error ? (
          <LoadingAndErrorWrapper error={error} />
        ) : !hasGrouping ? (
          <ResultSkeleton
            query={query}
            result={result}
            onQueryChange={updateQuery}
          />
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

/** One formula bar per calculation, plus a row that adds a new one. */
function RowFormulaBars({
  query,
  aggregations,
  isAddingCalculation,
  onAddingCalculationChange,
  onQueryChange,
}: {
  query: Lib.Query;
  aggregations: Lib.AggregationClause[];
  isAddingCalculation: boolean;
  onAddingCalculationChange: (isAdding: boolean) => void;
  onQueryChange: (query: Lib.Query) => void;
}) {
  return (
    <>
      {aggregations.map((aggregation, index) => (
        <TableFormulaBar
          key={index}
          query={query}
          aggregationIndex={index}
          onChange={onQueryChange}
          onRemove={
            aggregations.length > 1
              ? () => onQueryChange(Lib.removeClause(query, -1, aggregation))
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
            onAddingCalculationChange(false);
            onQueryChange(nextQuery);
          }}
          onRemove={() => onAddingCalculationChange(false)}
        />
      ) : (
        <UnstyledButton
          className={S.addCalculation}
          onClick={() => onAddingCalculationChange(true)}
        >
          <Group gap="sm" wrap="nowrap">
            <Icon name="add" aria-hidden />
            <Text c="inherit">{t`Add calculation`}</Text>
          </Group>
        </UnstyledButton>
      )}
    </>
  );
}

function ExplorerHeader({
  question,
  returnTo,
  barVariant,
  onBarVariantChange,
  onQueryChange,
}: {
  question: Question;
  returnTo: string | null;
  barVariant: FormulaBarVariant;
  onBarVariantChange: (variant: FormulaBarVariant) => void;
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
        <Tooltip label={t`Prototype: compare formula bar layouts`}>
          <SegmentedControl
            aria-label={t`Formula bar layout`}
            value={barVariant}
            data={[
              { value: "single", label: t`Single bar` },
              { value: "row", label: t`Bar per calculation` },
            ]}
            onChange={(value) =>
              onBarVariantChange(value === "row" ? "row" : "single")
            }
          />
        </Tooltip>
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
