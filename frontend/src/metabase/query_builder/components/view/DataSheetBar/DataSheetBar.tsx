import { useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  ExpressionWidget,
  prefetchExpressionWidget,
} from "metabase/querying/components/expressions/ExpressionWidget";
import {
  Box,
  Flex,
  Icon,
  Input,
  Popover,
  SegmentedControl,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import { PreventPopoverExitProvider } from "metabase/ui/components/utils/PreventPopoverExit";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import S from "./DataSheetBar.module.css";
import {
  type AppliedSearchFilter,
  applySearchFilter,
  getDataPath,
  getSearchColumn,
  getUniqueColumnName,
} from "./utils";

const STAGE_INDEX = -1;

type DataSheetBarMode = "search" | "formula";

type DataSheetBarProps = {
  question: Question;
  updateQuestion: (question: Question, opts?: { run?: boolean }) => void;
};

/**
 * Full-width bar above the data tab's table: either a search that filters rows by the
 * table's name column, or a formula bar that adds custom columns with custom expressions.
 */
export function DataSheetBar({ question, updateQuestion }: DataSheetBarProps) {
  const [mode, setMode] = useState<DataSheetBarMode>("search");
  const dataPath = getDataPath(question);
  // a search filter belongs to the table it was applied to
  const searchKey = String(Lib.sourceTableOrCardId(question.query()));

  return (
    <Flex
      className={S.root}
      align="center"
      gap="sm"
      data-testid="data-sheet-bar"
    >
      {/* both stay mounted so switching modes keeps track of the applied search filter */}
      <Box flex={1} miw={0} display={mode === "search" ? undefined : "none"}>
        <SearchFilterInput
          key={searchKey}
          question={question}
          dataPath={dataPath}
          updateQuestion={updateQuestion}
        />
      </Box>
      <Box flex={1} miw={0} display={mode === "formula" ? undefined : "none"}>
        <FormulaInput
          question={question}
          dataPath={dataPath}
          updateQuestion={updateQuestion}
        />
      </Box>
      <SegmentedControl
        value={mode}
        onChange={setMode}
        data={[
          { value: "search", label: t`Search`, icon: "search" },
          { value: "formula", label: t`Formula`, icon: "function" },
        ]}
        onMouseEnter={prefetchExpressionWidget}
      />
    </Flex>
  );
}

type SearchFilterInputProps = DataSheetBarProps & { dataPath: string };

function SearchFilterInput({
  question,
  dataPath,
  updateQuestion,
}: SearchFilterInputProps) {
  const [searchText, setSearchText] = useState("");
  const [appliedFilter, setAppliedFilter] =
    useState<AppliedSearchFilter | null>(null);
  const debouncedSearchText = useDebouncedValue(
    searchText.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );
  const latestQuestion = useLatest(question);

  const query = question.query();
  const searchColumn = useMemo(
    () => getSearchColumn(query, STAGE_INDEX),
    [query],
  );

  useEffect(() => {
    if (debouncedSearchText === (appliedFilter?.searchText ?? "")) {
      return;
    }
    const currentQuestion = latestQuestion.current;
    const { query: nextQuery, filter } = applySearchFilter(
      currentQuestion.query(),
      STAGE_INDEX,
      appliedFilter,
      debouncedSearchText,
    );
    setAppliedFilter(filter);
    updateQuestion(currentQuestion.setQuery(nextQuery), { run: true });
  }, [debouncedSearchText, appliedFilter, latestQuestion, updateQuestion]);

  const searchColumnName = searchColumn
    ? Lib.displayInfo(query, STAGE_INDEX, searchColumn).longDisplayName
    : null;

  return (
    <TextInput
      size="md"
      classNames={{ input: S.input }}
      value={searchText}
      disabled={searchColumn == null}
      placeholder={
        searchColumn
          ? t`Search ${dataPath}`
          : t`${dataPath} has no text column to search`
      }
      aria-label={t`Search ${dataPath}`}
      leftSection={<Icon name="search" />}
      rightSectionWidth="auto"
      rightSectionPointerEvents="all"
      rightSection={
        <Flex align="center" gap="xs" pr="sm">
          {searchColumnName && (
            <Text size="sm" c="text-secondary" className={S.hint}>
              {t`Matching ${searchColumnName}`}
            </Text>
          )}
          {searchText.length > 0 && (
            <Input.ClearButton onClick={() => setSearchText("")} />
          )}
        </Flex>
      }
      onChange={(event) => setSearchText(event.currentTarget.value)}
    />
  );
}

type FormulaInputProps = DataSheetBarProps & { dataPath: string };

function FormulaInput({
  question,
  dataPath,
  updateQuestion,
}: FormulaInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const query = question.query();
  const availableColumns = useMemo(
    () => Lib.expressionableColumns(query, STAGE_INDEX),
    [query],
  );

  const handleChangeClause = (name: string, clause: Lib.ExpressionClause) => {
    const uniqueName = getUniqueColumnName(query, STAGE_INDEX, name);
    const nextQuery = Lib.expression(
      query,
      STAGE_INDEX,
      uniqueName,
      Lib.withExpressionName(clause, uniqueName),
    );
    updateQuestion(question.setQuery(nextQuery), { run: true });
  };

  return (
    <PreventPopoverExitProvider>
      <Popover
        opened={isOpen}
        position="bottom-start"
        offset={{ mainAxis: 4 }}
        trapFocus
        onChange={setIsOpen}
      >
        <Popover.Target>
          <UnstyledButton
            className={S.formulaTrigger}
            aria-label={t`Add a column with a formula`}
            onClick={() => setIsOpen((value) => !value)}
          >
            <span className={S.formulaBadge}>{t`fx`}</span>
            <span className={S.formulaPlaceholder}>
              {t`= Add a column to ${dataPath} with a formula…`}
            </span>
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown data-testid="data-sheet-formula-popover">
          <ExpressionWidget
            query={query}
            stageIndex={STAGE_INDEX}
            availableColumns={availableColumns}
            withName
            onChangeClause={handleChangeClause}
            onClose={() => setIsOpen(false)}
          />
        </Popover.Dropdown>
      </Popover>
    </PreventPopoverExitProvider>
  );
}
