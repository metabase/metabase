import { useMemo, useState } from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { useDispatch } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import {
  Box,
  Button,
  Flex,
  Icon,
  Popover,
  SegmentedControl,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { PinButton } from "../ExplorePins";

import S from "./ExploreBar.module.css";
import { addSplit, applyCut, getCutTabs } from "./cuts";
import {
  type ExploreSuggestion,
  type ExploreSuggestionContext,
  getCompareSuggestions,
} from "./suggestions";
import {
  type ExploreView,
  STAGE_INDEX,
  canShowAsChart,
  getExploreView,
  isSummarized,
  switchExploreView,
} from "./utils";

type ExploreActionsProps = {
  question: Question;
  context: ExploreSuggestionContext;
  isSaved: boolean;
  onQueryChange: (query: Lib.Query) => void;
  onQuestionChange: (question: Question) => void;
};

/** What you can do to the view on screen: reshape it, filter it, compare it, or save it. */
export function ExploreActions({
  question,
  context,
  isSaved,
  onQueryChange,
  onQuestionChange,
}: ExploreActionsProps) {
  const dispatch = useDispatch();
  const query = question.query();

  return (
    <Flex align="center" gap="xs" ml="auto">
      {isSummarized(query) && (
        <ExploreViewSwitcher
          query={query}
          view={getExploreView(question)}
          onChange={(view) =>
            onQuestionChange(switchExploreView(question, view))
          }
        />
      )}
      <FilterButton query={query} onQueryChange={onQueryChange} />
      <CompareButton context={context} onQueryChange={onQueryChange} />
      <Button
        size="sm"
        variant="filled"
        disabled={isSaved}
        onClick={() => dispatch(setUIControls({ modal: "save" }))}
      >
        {isSaved ? t`Saved` : t`Save`}
      </Button>
      <PinButton question={question} />
    </Flex>
  );
}

type QueryChangeProps = {
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

function FilterButton({ query, onQueryChange }: QueryChangeProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-end">
      <Popover.Target>
        <Button
          size="sm"
          variant="subtle"
          leftSection={<Icon name="filter" />}
          onClick={() => setIsOpen(!isOpen)}
        >
          {t`Filter`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={STAGE_INDEX}
          onSelect={(filter) => {
            onQueryChange(Lib.filter(query, STAGE_INDEX, filter));
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type CompareButtonProps = {
  context: ExploreSuggestionContext;
  onQueryChange: (query: Lib.Query) => void;
};

/** Brings more into the view: another calculation next to the current ones, or a split. */
function CompareButton({ context, onQueryChange }: CompareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPickingCalculation, setIsPickingCalculation] = useState(false);
  const { query } = context;

  const close = () => {
    setIsOpen(false);
    setIsPickingCalculation(false);
  };
  const apply = (nextQuery: Lib.Query) => {
    onQueryChange(nextQuery);
    close();
  };

  return (
    <Popover
      opened={isOpen}
      onChange={(opened) => (opened ? setIsOpen(true) : close())}
      position="bottom-end"
    >
      <Popover.Target>
        <Button
          size="sm"
          variant="subtle"
          leftSection={<Icon name="add" />}
          onClick={() => (isOpen ? close() : setIsOpen(true))}
        >
          {t`Compare`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        {isPickingCalculation ? (
          <AggregationPicker
            query={query}
            stageIndex={STAGE_INDEX}
            operators={Lib.availableAggregationOperators(query, STAGE_INDEX)}
            allowCustomExpressions
            allowMetrics
            onQueryChange={apply}
            onBack={() => setIsPickingCalculation(false)}
            onClose={close}
          />
        ) : (
          <CompareOptions
            context={context}
            onApply={apply}
            onPickCalculation={() => setIsPickingCalculation(true)}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

type CompareOptionsProps = {
  context: ExploreSuggestionContext;
  onApply: (query: Lib.Query) => void;
  onPickCalculation: () => void;
};

function CompareOptions({
  context,
  onApply,
  onPickCalculation,
}: CompareOptionsProps) {
  const { query } = context;
  const calculations = useMemo(
    () => getCompareSuggestions(context, 6),
    [context],
  );
  const hasBreakouts = Lib.breakouts(query, STAGE_INDEX).length > 0;
  const groupings = useMemo(
    () =>
      getCutTabs(query).flatMap((tab) =>
        tab.kind === "dimension" && !tab.isActive ? [tab] : [],
      ),
    [query],
  );
  const applySuggestion = (suggestion: ExploreSuggestion) =>
    suggestion.apply && onApply(suggestion.apply(query));

  return (
    <Box className={S.compare}>
      <Text className={S.compareTitle}>{t`Compare with`}</Text>
      {calculations.map((suggestion) => (
        <CompareOption
          key={suggestion.id}
          icon={suggestion.icon}
          label={suggestion.label}
          onClick={() => applySuggestion(suggestion)}
        />
      ))}
      <CompareOption
        icon="function"
        label={t`Custom calculation…`}
        onClick={onPickCalculation}
      />
      <Text className={S.compareTitle} mt="sm">
        {hasBreakouts ? t`Split by` : t`Break down by`}
      </Text>
      {groupings.map((tab) => (
        <CompareOption
          key={tab.key}
          icon={Lib.isTemporal(tab.column) ? "calendar" : "split"}
          label={tab.longLabel}
          onClick={() =>
            onApply(
              hasBreakouts
                ? addSplit(query, tab.column, [])
                : applyCut(query, tab, []),
            )
          }
        />
      ))}
    </Box>
  );
}

type CompareOptionProps = {
  icon: ExploreSuggestion["icon"];
  label: string;
  onClick: () => void;
};

function CompareOption({ icon, label, onClick }: CompareOptionProps) {
  return (
    <UnstyledButton className={S.compareOption} onClick={onClick}>
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </UnstyledButton>
  );
}

type ExploreViewSwitcherProps = {
  query: Lib.Query;
  view: ExploreView;
  onChange: (view: ExploreView) => void;
};

function ExploreViewSwitcher({
  query,
  view,
  onChange,
}: ExploreViewSwitcherProps) {
  const hasBreakouts = Lib.breakouts(query, STAGE_INDEX).length > 0;
  const canChart = canShowAsChart(query);
  const data = [
    {
      value: "chart",
      label: hasBreakouts ? t`Chart` : t`Number`,
      disabled: !canChart,
    },
    ...(hasBreakouts ? [{ value: "pivot", label: t`Pivot` }] : []),
    { value: "table", label: t`Table` },
  ];

  return (
    <Tooltip label={t`Charts show up to two groupings`} disabled={canChart}>
      <Box mr="xs">
        <SegmentedControl
          value={view}
          data={data}
          onChange={(value) => {
            if (value === "chart" || value === "pivot" || value === "table") {
              onChange(value);
            }
          }}
        />
      </Box>
    </Tooltip>
  );
}
