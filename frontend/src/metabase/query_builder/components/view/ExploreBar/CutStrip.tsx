import cx from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Menu,
  Popover,
  SegmentedControl,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import S from "./ExploreBar.module.css";
import { ExplorePill } from "./ExplorePill";
import { type CutTab, addSplit, applyCut, getCutTabs } from "./cuts";
import type { ExploreHistory } from "./use-explore-history";
import {
  type ExploreView,
  STAGE_INDEX,
  canShowAsChart,
  getExploreView,
  isSummarized,
  switchExploreView,
} from "./utils";

type CutStripProps = {
  question: Question;
  history: ExploreHistory;
  onQueryChange: (query: Lib.Query) => void;
  onQuestionChange: (question: Question) => void;
};

/**
 * Cuts of the current slice, like the metrics explorer's dimension tabs: its rows, a total, or
 * grouped by one of its columns. The calculations and the view sit next to them.
 */
export function CutStrip({
  question,
  history,
  onQueryChange,
  onQuestionChange,
}: CutStripProps) {
  const query = question.query();
  const tabs = useMemo(() => getCutTabs(query), [query]);
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const previousAggregations = usePreviousAggregations(aggregations);
  const activeDimensionCount = tabs.filter(
    (tab) => tab.kind === "dimension" && tab.isActive,
  ).length;
  const hasSummary = isSummarized(query);

  const handleCut = (tab: CutTab) =>
    onQueryChange(applyCut(query, tab, previousAggregations));

  return (
    <Flex className={S.cutStrip} align="center" gap="md">
      <Flex gap={2}>
        <Tooltip label={t`Back`}>
          <ActionIcon
            aria-label={t`Back`}
            disabled={!history.canGoBack}
            onClick={history.goBack}
          >
            <Icon name="chevronleft" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Forward`}>
          <ActionIcon
            aria-label={t`Forward`}
            disabled={!history.canGoForward}
            onClick={history.goForward}
          >
            <Icon name="chevronright" />
          </ActionIcon>
        </Tooltip>
      </Flex>

      <Flex className={S.cutTabs} align="center" role="tablist">
        {tabs.map((tab) => (
          <CutTabButton
            key={tab.key}
            tab={tab}
            query={query}
            canSplit={activeDimensionCount > 0}
            isOnlyActive={activeDimensionCount <= 1}
            onCut={() => handleCut(tab)}
            onSplit={(column) =>
              onQueryChange(addSplit(query, column, previousAggregations))
            }
            onQueryChange={onQueryChange}
          />
        ))}
      </Flex>

      {aggregations.length > 0 && (
        <Flex className={S.calculations} align="center" gap="xs">
          <Text className={S.stripLabel}>{t`Showing`}</Text>
          {aggregations.map((clause, index) => (
            <ExplorePill
              key={index}
              pill={{
                key: `aggregation:${index}`,
                kind: "aggregation",
                clause,
                index,
                label: Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
              }}
              query={query}
              onQueryChange={onQueryChange}
            />
          ))}
          <AddCalculationButton query={query} onQueryChange={onQueryChange} />
        </Flex>
      )}

      {hasSummary && (
        <Box ml="auto">
          <ExploreViewSwitcher
            query={query}
            view={getExploreView(question)}
            onChange={(view) =>
              onQuestionChange(switchExploreView(question, view))
            }
          />
        </Box>
      )}
    </Flex>
  );
}

/** The calculations last in use, so going back from rows to a grouping brings them back. */
function usePreviousAggregations(
  aggregations: Lib.AggregationClause[],
): Lib.AggregationClause[] {
  const previous = useRef<Lib.AggregationClause[]>([]);
  useEffect(() => {
    if (aggregations.length > 0) {
      previous.current = aggregations;
    }
  }, [aggregations]);
  return aggregations.length > 0 ? aggregations : previous.current;
}

type CutTabButtonProps = {
  tab: CutTab;
  query: Lib.Query;
  canSplit: boolean;
  isOnlyActive: boolean;
  onCut: () => void;
  onSplit: (column: Lib.ColumnMetadata) => void;
  onQueryChange: (query: Lib.Query) => void;
};

function CutTabButton({
  tab,
  query,
  canSplit,
  isOnlyActive,
  onCut,
  onSplit,
  onQueryChange,
}: CutTabButtonProps) {
  const label = getTabLabel(tab);
  const tooltip = tab.kind === "dimension" ? tab.longLabel : undefined;

  return (
    <Flex
      className={cx(S.cutTab, { [S.cutTabActive]: tab.isActive })}
      align="center"
      role="tab"
      aria-selected={tab.isActive}
    >
      <Tooltip label={tooltip} disabled={tooltip == null || tooltip === label}>
        <UnstyledButton className={S.cutTabButton} onClick={onCut}>
          {label}
        </UnstyledButton>
      </Tooltip>
      {tab.kind === "dimension" && tab.isActive && tab.breakout && (
        <TemporalUnitMenu
          query={query}
          breakout={tab.breakout}
          column={tab.column}
          onQueryChange={onQueryChange}
        />
      )}
      {tab.kind === "dimension" &&
        tab.isActive &&
        tab.breakout &&
        !isOnlyActive && (
          <UnstyledButton
            className={S.cutTabIcon}
            aria-label={t`Stop grouping by ${label}`}
            onClick={() => {
              if (tab.breakout) {
                onQueryChange(
                  Lib.removeClause(query, STAGE_INDEX, tab.breakout),
                );
              }
            }}
          >
            <Icon name="close" size={10} />
          </UnstyledButton>
        )}
      {tab.kind === "dimension" && !tab.isActive && canSplit && (
        <Tooltip label={t`Split by ${label} too`}>
          <UnstyledButton
            className={cx(S.cutTabIcon, S.cutTabSplit)}
            aria-label={t`Split by ${label} too`}
            onClick={() => onSplit(tab.column)}
          >
            <Icon name="add" size={10} />
          </UnstyledButton>
        </Tooltip>
      )}
    </Flex>
  );
}

function getTabLabel(tab: CutTab): string {
  switch (tab.kind) {
    case "rows":
      return t`Rows`;
    case "total":
      return t`Total`;
    case "dimension":
      return tab.label;
  }
}

type TemporalUnitMenuProps = {
  query: Lib.Query;
  breakout: Lib.BreakoutClause;
  column: Lib.ColumnMetadata;
  onQueryChange: (query: Lib.Query) => void;
};

function TemporalUnitMenu({
  query,
  breakout,
  column,
  onQueryChange,
}: TemporalUnitMenuProps) {
  const breakoutColumn = Lib.breakoutColumn(query, STAGE_INDEX, breakout);
  const bucketColumn = breakoutColumn ?? column;
  const buckets = Lib.isTemporal(bucketColumn)
    ? Lib.availableTemporalBuckets(query, STAGE_INDEX, bucketColumn)
    : [];
  const currentBucket = Lib.temporalBucket(breakout);
  if (buckets.length === 0 || currentBucket == null) {
    return null;
  }
  const current = Lib.displayInfo(query, STAGE_INDEX, currentBucket);

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <UnstyledButton className={S.cutTabUnit}>
          {t`by ${current.displayName.toLowerCase()}`}
          <Icon name="chevrondown" size={10} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown mah="20rem" style={{ overflowY: "auto" }}>
        {buckets.map((bucket) => {
          const info = Lib.displayInfo(query, STAGE_INDEX, bucket);
          return (
            <Menu.Item
              key={info.shortName}
              rightSection={
                info.shortName === current.shortName ? (
                  <Icon name="check" />
                ) : null
              }
              onClick={() =>
                onQueryChange(
                  Lib.replaceClause(
                    query,
                    STAGE_INDEX,
                    breakout,
                    Lib.withTemporalBucket(bucketColumn, bucket),
                  ),
                )
              }
            >
              {info.displayName}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

type AddCalculationButtonProps = {
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

function AddCalculationButton({
  query,
  onQueryChange,
}: AddCalculationButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-start">
      <Popover.Target>
        <Tooltip label={t`Add a calculation`}>
          <ActionIcon
            aria-label={t`Add a calculation`}
            onClick={() => setIsOpen(!isOpen)}
          >
            <Icon name="add" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <AggregationPicker
          query={query}
          stageIndex={STAGE_INDEX}
          operators={Lib.availableAggregationOperators(query, STAGE_INDEX)}
          allowCustomExpressions
          allowMetrics
          onQueryChange={(nextQuery) => {
            onQueryChange(nextQuery);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
        />
      </Popover.Dropdown>
    </Popover>
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
      <Box>
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
