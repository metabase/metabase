import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import type { CodeMirrorRef } from "metabase/common/components/CodeMirror";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Box,
  Flex,
  Icon,
  Input,
  SegmentedControl,
  Text,
  TextInput,
} from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import S from "./DataSheetBar.module.css";
import { FormulaEditor } from "./FormulaEditor";
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
 * Like a spreadsheet, typing `=` into an empty search starts a formula, and typing `/`
 * into an empty formula goes back to search.
 */
export function DataSheetBar({ question, updateQuestion }: DataSheetBarProps) {
  const [mode, setMode] = useState<DataSheetBarMode>("search");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const formulaEditorRef = useRef<CodeMirrorRef>(null);
  const query = question.query();
  const dataPath = getDataPath(question);
  // a search filter belongs to the table it was applied to
  const searchKey = String(Lib.sourceTableOrCardId(query));

  // inputs are hidden until the mode change commits, so focus on the next frame
  const focusSearch = () =>
    requestAnimationFrame(() => searchInputRef.current?.focus());
  const focusFormula = () =>
    requestAnimationFrame(() => formulaEditorRef.current?.view?.focus());

  const handleModeChange = (nextMode: DataSheetBarMode) => {
    setMode(nextMode);
    if (nextMode === "formula") {
      focusFormula();
    } else {
      focusSearch();
    }
  };

  const handleAddColumn = (name: string, clause: Lib.ExpressionClause) => {
    const uniqueName = getUniqueColumnName(query, STAGE_INDEX, name);
    const nextQuery = Lib.expression(
      query,
      STAGE_INDEX,
      uniqueName,
      Lib.withExpressionName(clause, uniqueName),
    );
    updateQuestion(question.setQuery(nextQuery), { run: true });
  };

  const modeToggle = <ModeToggle mode={mode} onChange={handleModeChange} />;

  return (
    <Box className={S.root} data-testid="data-sheet-bar">
      {/* both stay mounted so switching modes keeps the search filter and the formula in progress */}
      <Box display={mode === "search" ? undefined : "none"}>
        <SearchFilterInput
          key={searchKey}
          question={question}
          dataPath={dataPath}
          inputRef={searchInputRef}
          modeToggle={modeToggle}
          updateQuestion={updateQuestion}
          onStartFormula={() => handleModeChange("formula")}
        />
      </Box>
      <Box display={mode === "formula" ? undefined : "none"}>
        <FormulaEditor
          query={query}
          stageIndex={STAGE_INDEX}
          dataPath={dataPath}
          editorRef={formulaEditorRef}
          modeToggle={modeToggle}
          onAddColumn={handleAddColumn}
          onStartSearch={() => handleModeChange("search")}
        />
      </Box>
    </Box>
  );
}

type ModeToggleProps = {
  mode: DataSheetBarMode;
  onChange: (mode: DataSheetBarMode) => void;
};

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <SegmentedControl
      value={mode}
      onChange={onChange}
      data={[
        {
          value: "search",
          icon: "search",
          ariaLabel: t`Search (type /)`,
          withTooltip: true,
        },
        {
          value: "formula",
          icon: "function",
          ariaLabel: t`Formula (type =)`,
          withTooltip: true,
        },
      ]}
    />
  );
}

type SearchFilterInputProps = DataSheetBarProps & {
  dataPath: string;
  inputRef: Ref<HTMLInputElement>;
  modeToggle: ReactNode;
  onStartFormula: () => void;
};

function SearchFilterInput({
  question,
  dataPath,
  inputRef,
  modeToggle,
  updateQuestion,
  onStartFormula,
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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // like a spreadsheet cell, a leading "=" starts a formula
    if (event.key === "=" && searchText.length === 0) {
      event.preventDefault();
      onStartFormula();
    }
  };

  const searchColumnName = searchColumn
    ? Lib.displayInfo(query, STAGE_INDEX, searchColumn).longDisplayName
    : null;

  return (
    <TextInput
      ref={inputRef}
      size="md"
      classNames={{ input: S.input }}
      value={searchText}
      readOnly={searchColumn == null}
      placeholder={
        searchColumn
          ? t`Search ${dataPath}, or type = to add a formula`
          : t`${dataPath} has no text column to search. Type = to add a formula`
      }
      aria-label={t`Search ${dataPath}`}
      leftSection={<Icon name="search" />}
      rightSectionWidth="auto"
      rightSectionPointerEvents="all"
      rightSection={
        <Flex align="center" gap="sm" pr="xs">
          {searchColumnName && (
            <Text size="sm" c="text-secondary" className={S.hint}>
              {t`Matching ${searchColumnName}`}
            </Text>
          )}
          {searchText.length > 0 && (
            <Input.ClearButton onClick={() => setSearchText("")} />
          )}
          {modeToggle}
        </Flex>
      }
      onKeyDown={handleKeyDown}
      onChange={(event) => setSearchText(event.currentTarget.value)}
    />
  );
}
