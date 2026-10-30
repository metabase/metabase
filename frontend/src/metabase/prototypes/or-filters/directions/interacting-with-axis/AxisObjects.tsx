import cx from "classnames";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import { QueryColumnPicker } from "metabase/querying/common/components/QueryColumnPicker";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Icon,
  type IconName,
  Popover,
  PopoverBackButton,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { toFilterClause } from "../../harness/clauses";
import {
  type AxisTitleFrame,
  NestedMenuButton,
} from "../chart-filters/QuestionChart";
import type { DrillOptionTarget } from "../chart-filters/drillMenu";

import S from "./AxisObjects.module.css";

const ROWS_STAGE = 0;
const SUMMARY_STAGE = 1;
const TOP_LIMIT = 10;
const LIST_MAX_HEIGHT = 320;

type ApplyQuery = (query: Lib.Query, target?: DrillOptionTarget) => void;

type AxisTitleProps = {
  query: Lib.Query;
  frame: AxisTitleFrame;
  onChange: ApplyQuery;
};

/** The y-axis title, as the measure it names. */
export function MeasureAxisTitle({ query, frame, onChange }: AxisTitleProps) {
  const aggregation = Lib.aggregations(query, ROWS_STAGE).find(
    (clause) => getName(query, clause) === frame.text,
  );
  if (!aggregation) {
    return null;
  }
  return (
    <AxisTarget
      label={frame.text}
      fontSize={frame.fontSize}
      isVertical
      menu={(close) => (
        <MeasureMenu
          query={query}
          aggregation={aggregation}
          onChange={(nextQuery, target) => {
            onChange(nextQuery, target);
            close();
          }}
        />
      )}
    />
  );
}

/** The x-axis title, as the dimension it names: the first breakout. */
export function DimensionAxisTitle({ query, frame, onChange }: AxisTitleProps) {
  const breakout = Lib.breakouts(query, ROWS_STAGE)[0];
  if (!breakout) {
    return null;
  }
  return (
    <AxisTarget
      label={frame.text}
      fontSize={frame.fontSize}
      menu={(close) => (
        <DimensionMenu
          query={query}
          breakout={breakout}
          onChange={(nextQuery, target) => {
            onChange(nextQuery, target);
            close();
          }}
        />
      )}
    />
  );
}

type AxisTargetProps = {
  label: string;
  fontSize: string;
  isVertical?: boolean;
  menu: (close: () => void) => ReactNode;
};

function AxisTarget({ label, fontSize, isVertical, menu }: AxisTargetProps) {
  const [isOpened, setIsOpened] = useState(false);
  return (
    <Popover
      opened={isOpened}
      position={isVertical ? "right" : "bottom"}
      trapFocus
      onChange={setIsOpened}
    >
      <Popover.Target>
        <UnstyledButton
          className={cx(S.target, isVertical && S.vertical)}
          data-active={isOpened || undefined}
          onClick={() => setIsOpened(!isOpened)}
        >
          <Text fz={fontSize} fw="bold" c="inherit">
            {label}
          </Text>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>{menu(() => setIsOpened(false))}</Popover.Dropdown>
    </Popover>
  );
}

type MenuView =
  | "actions"
  | "replace"
  | "compare"
  | "column"
  | "bucket"
  | "split"
  | "filter"
  | "sort";

type MeasureMenuProps = {
  query: Lib.Query;
  aggregation: Lib.AggregationClause;
  onChange: ApplyQuery;
};

/**
 * What you do to a measure, most common first: swap it, or add one to compare.
 * Sort, top 10 and filter are details, so they sit under the line, smaller.
 */
function MeasureMenu({ query, aggregation, onChange }: MeasureMenuProps) {
  const [view, setView] = useState<MenuView>("actions");
  const name = getName(query, aggregation);
  const aggregations = Lib.aggregations(query, ROWS_STAGE);
  const availableOperators = Lib.availableAggregationOperators(
    query,
    ROWS_STAGE,
  );
  // Marks the measure's own operator, so the picker opens on the list and not
  // on the expression editor.
  const operators =
    view === "replace"
      ? Lib.selectedAggregationOperators(availableOperators, aggregation)
      : availableOperators;
  const back = () => setView("actions");

  if (view === "replace" || view === "compare") {
    return (
      <AggregationPicker
        query={query}
        stageIndex={ROWS_STAGE}
        clause={view === "replace" ? aggregation : undefined}
        clauseIndex={
          view === "replace" ? aggregations.indexOf(aggregation) : undefined
        }
        operators={operators}
        allowCustomExpressions
        allowMetrics
        onBack={back}
        onQueryChange={(nextQuery) => onChange(Lib.dropEmptyStages(nextQuery))}
      />
    );
  }
  const sortDirection = getSortDirection(query, name);
  const sortMeasure = (direction: Lib.OrderByDirection) =>
    onChange(sortBy(query, name, direction));

  if (view === "sort") {
    return (
      <SortPicker
        currentDirection={sortDirection}
        onBack={back}
        onSort={sortMeasure}
      />
    );
  }
  if (view === "filter") {
    return (
      <MeasureFilterPicker
        query={query}
        name={name}
        onBack={back}
        onChange={(nextQuery) => onChange(nextQuery, "summary")}
      />
    );
  }

  const limit = Lib.currentLimit(query, ROWS_STAGE);
  const condition = describeMeasureFilters(query, name);

  return (
    <MenuList>
      <Action icon="sync" onClick={() => setView("replace")}>
        {t`Replace with…`}
      </Action>
      <Action icon="add" onClick={() => setView("compare")}>
        {t`Compare with another measure`}
      </Action>
      <MenuDivider />
      <Action
        icon="filter"
        trailing={condition}
        onClick={() => setView("filter")}
      >
        {t`Filter by ${name}…`}
      </Action>
      <SortAction
        currentDirection={sortDirection}
        onOpen={() => setView("sort")}
        onSort={sortMeasure}
      />
      <Action
        icon="list"
        onClick={() =>
          onChange(
            limit === TOP_LIMIT
              ? Lib.limit(query, ROWS_STAGE, null)
              : Lib.limit(sortBy(query, name, "desc"), ROWS_STAGE, TOP_LIMIT),
          )
        }
      >
        {limit === TOP_LIMIT
          ? t`Show all, not just the top ${TOP_LIMIT}`
          : t`Only the top ${TOP_LIMIT}`}
      </Action>
      {aggregations.length > 1 && (
        <Action
          icon="trash"
          onClick={() =>
            onChange(Lib.removeClause(query, ROWS_STAGE, aggregation))
          }
        >
          {t`Remove`}
        </Action>
      )}
    </MenuList>
  );
}

type DimensionMenuProps = {
  query: Lib.Query;
  breakout: Lib.BreakoutClause;
  onChange: ApplyQuery;
};

/**
 * What you do to the x-axis, most common first: swap it, regroup it, split
 * it into series. Filter and sort are details, under the line.
 */
function DimensionMenu({ query, breakout, onChange }: DimensionMenuProps) {
  const [view, setView] = useState<MenuView>("actions");
  const name = getName(query, breakout);
  const column = Lib.breakoutColumn(query, ROWS_STAGE, breakout);
  const buckets = column ? getBuckets(query, column) : [];
  const currentBucket = buckets.find(
    (bucket) => Lib.displayInfo(query, ROWS_STAGE, bucket).selected,
  );
  const seriesBreakout = Lib.breakouts(query, ROWS_STAGE)[1];
  const seriesColumn = seriesBreakout
    ? Lib.breakoutColumn(query, ROWS_STAGE, seriesBreakout)
    : null;
  const back = () => setView("actions");

  if (view === "column" || view === "split") {
    return (
      <ColumnPicker
        query={query}
        title={view === "column" ? t`Change to` : t`Split into series by`}
        onBack={back}
        onSelect={(nextColumn) =>
          onChange(
            view === "column"
              ? Lib.replaceClause(query, ROWS_STAGE, breakout, nextColumn)
              : splitBy(query, seriesBreakout, nextColumn),
          )
        }
      />
    );
  }
  if (view === "bucket" && column) {
    return (
      <BucketPicker
        query={query}
        column={column}
        buckets={buckets}
        onBack={back}
        onSelect={(nextColumn) =>
          onChange(Lib.replaceClause(query, ROWS_STAGE, breakout, nextColumn))
        }
      />
    );
  }
  // A chart already sorts its x-axis ascending.
  const sortDirection = getSortDirection(query, name) ?? "asc";
  const sortDimension = (direction: Lib.OrderByDirection) =>
    onChange(sortBy(query, name, direction));

  if (view === "sort") {
    return (
      <SortPicker
        currentDirection={sortDirection}
        onBack={back}
        onSort={sortDimension}
      />
    );
  }
  if (view === "filter" && column) {
    return (
      <DimensionFilterPicker
        query={query}
        column={column}
        onBack={back}
        onChange={(nextQuery) => onChange(nextQuery, "rows")}
      />
    );
  }

  return (
    <MenuList>
      <Action icon="sync" onClick={() => setView("column")}>
        {t`Change to…`}
      </Action>
      {currentBucket && (
        <Action
          icon="calendar"
          trailing={
            Lib.displayInfo(query, ROWS_STAGE, currentBucket).displayName
          }
          onClick={() => setView("bucket")}
        >
          {t`Group by`}
        </Action>
      )}
      <Action
        icon="arrow_split"
        trailing={
          seriesBreakout &&
          seriesColumn && (
            <RemovableValue
              label={t`Don't split into series`}
              onRemove={() =>
                onChange(Lib.removeClause(query, ROWS_STAGE, seriesBreakout))
              }
            >
              {Lib.displayInfo(query, ROWS_STAGE, seriesColumn).displayName}
            </RemovableValue>
          )
        }
        onClick={() => setView("split")}
      >
        {seriesColumn ? t`Split into series by` : t`Split into series by…`}
      </Action>
      <MenuDivider />
      <Action icon="filter" onClick={() => setView("filter")}>
        {t`Filter by ${getUnbucketedName(query, column) ?? name}…`}
      </Action>
      <SortAction
        currentDirection={sortDirection}
        onOpen={() => setView("sort")}
        onSort={sortDimension}
      />
    </MenuList>
  );
}

const SORT_OPTIONS = [
  { direction: "asc", icon: "arrow_up", title: () => t`Sort ascending` },
  { direction: "desc", icon: "arrow_down", title: () => t`Sort descending` },
] as const satisfies ReadonlyArray<{
  direction: Lib.OrderByDirection;
  icon: IconName;
  title: () => string;
}>;

/** Like the app's sort drill: the directions not already in effect. */
function getSortOptions(currentDirection: Lib.OrderByDirection | undefined) {
  return SORT_OPTIONS.filter((option) => option.direction !== currentDirection);
}

type SortActionProps = {
  currentDirection: Lib.OrderByDirection | undefined;
  onOpen: () => void;
  onSort: (direction: Lib.OrderByDirection) => void;
};

/** One direction left is the entry itself; two open a submenu. */
function SortAction({ currentDirection, onOpen, onSort }: SortActionProps) {
  const options = getSortOptions(currentDirection);
  if (options.length > 1) {
    return (
      <Action icon="sort" onClick={onOpen}>
        {t`Sort…`}
      </Action>
    );
  }
  return (
    <>
      {options.map((option) => (
        <Action
          key={option.direction}
          icon={option.icon}
          onClick={() => onSort(option.direction)}
        >
          {option.title()}
        </Action>
      ))}
    </>
  );
}

type SortPickerProps = {
  currentDirection: Lib.OrderByDirection | undefined;
  onBack: () => void;
  onSort: (direction: Lib.OrderByDirection) => void;
};

function SortPicker({ currentDirection, onBack, onSort }: SortPickerProps) {
  return (
    <MenuList>
      <PopoverBackButton mb="sm" onClick={onBack}>
        {t`Sort`}
      </PopoverBackButton>
      {getSortOptions(currentDirection).map((option) => (
        <Action
          key={option.direction}
          icon={option.icon}
          onClick={() => onSort(option.direction)}
        >
          {option.title()}
        </Action>
      ))}
    </MenuList>
  );
}

type RemovableValueProps = {
  label: string;
  children: ReactNode;
  onRemove: () => void;
};

/** A value on a menu entry with its own x: the entry changes it, the x drops it. */
function RemovableValue({ label, children, onRemove }: RemovableValueProps) {
  return (
    <Group component="span" gap="xs" wrap="nowrap">
      <span>{children}</span>
      <ActionIcon
        component="span"
        size="sm"
        variant="subtle"
        c="text-secondary"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Group>
  );
}

/** The padding and weight of the bar-click menu, so the two read as one. */
function MenuList({ children }: { children: ReactNode }) {
  return (
    <Stack gap="sm" px="xl" py="lg" fw={700}>
      {children}
    </Stack>
  );
}

function MenuDivider() {
  return <Divider mx="-xl" my="xs" />;
}

type ActionProps = {
  icon?: IconName;
  trailing?: ReactNode;
  children: ReactNode;
  onClick: () => void;
};

function Action({ icon, trailing, children, onClick }: ActionProps) {
  return (
    <NestedMenuButton icon={icon} onClick={onClick}>
      <span>{children}</span>
      {trailing && (
        <Text component="span" c="text-secondary" fw="normal" pl="md">
          {trailing}
        </Text>
      )}
    </NestedMenuButton>
  );
}

type ColumnPickerProps = {
  query: Lib.Query;
  title: string;
  onBack: () => void;
  onSelect: (column: Lib.ColumnMetadata) => void;
};

function ColumnPicker({ query, title, onBack, onSelect }: ColumnPickerProps) {
  return (
    <Stack gap={0}>
      <Box px="xl" pt="lg">
        <PopoverBackButton onClick={onBack}>{title}</PopoverBackButton>
      </Box>
      <QueryColumnPicker
        query={query}
        stageIndex={ROWS_STAGE}
        columnGroups={Lib.groupColumns(
          Lib.breakoutableColumns(query, ROWS_STAGE),
        )}
        hasBinning
        hasTemporalBucketing
        withDefaultBucketing
        checkIsColumnSelected={() => false}
        onSelect={onSelect}
      />
    </Stack>
  );
}

type BucketPickerProps = {
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  buckets: Lib.Bucket[];
  onBack: () => void;
  onSelect: (column: Lib.ColumnMetadata) => void;
};

function BucketPicker({
  query,
  column,
  buckets,
  onBack,
  onSelect,
}: BucketPickerProps) {
  const isTemporal = Lib.isTemporalBucketable(query, ROWS_STAGE, column);
  return (
    <MenuList>
      <PopoverBackButton mb="sm" onClick={onBack}>
        {t`Group by`}
      </PopoverBackButton>
      <ScrollArea.Autosize mah={LIST_MAX_HEIGHT}>
        {buckets.map((bucket, index) => {
          const info = Lib.displayInfo(query, ROWS_STAGE, bucket);
          return (
            <Action
              key={index}
              trailing={info.selected ? <Icon name="check" /> : undefined}
              onClick={() =>
                onSelect(
                  isTemporal
                    ? Lib.withTemporalBucket(column, bucket)
                    : Lib.withBinning(column, bucket),
                )
              }
            >
              {info.displayName}
            </Action>
          );
        })}
      </ScrollArea.Autosize>
    </MenuList>
  );
}

type DimensionFilterPickerProps = {
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  onBack: () => void;
  onChange: (query: Lib.Query) => void;
};

/** A filter on the rows, not the summary: it lands in the bar with the others. */
function DimensionFilterPicker({
  query,
  column,
  onBack,
  onChange,
}: DimensionFilterPickerProps) {
  const name = getUnbucketedName(query, column);
  const filterColumn = Lib.filterableColumns(query, ROWS_STAGE).find(
    (candidate) =>
      Lib.displayInfo(query, ROWS_STAGE, candidate).longDisplayName === name,
  );
  if (!filterColumn) {
    return null;
  }
  return (
    <FilterPickerBody
      query={query}
      stageIndex={ROWS_STAGE}
      column={filterColumn}
      isNew
      onBack={onBack}
      onChange={(clause) =>
        onChange(
          Lib.filter(
            query,
            ROWS_STAGE,
            toFilterClause(query, ROWS_STAGE, clause),
          ),
        )
      }
    />
  );
}

type MeasureFilterPickerProps = {
  query: Lib.Query;
  name: string;
  onBack: () => void;
  onChange: (query: Lib.Query) => void;
};

/** Lands in the bar as a summary pill, AND-ed after the row filters. */
function MeasureFilterPicker({
  query,
  name,
  onBack,
  onChange,
}: MeasureFilterPickerProps) {
  const summaryQuery =
    Lib.stageCount(query) > SUMMARY_STAGE ? query : Lib.appendStage(query);
  const column = Lib.filterableColumns(summaryQuery, SUMMARY_STAGE).find(
    (candidate) =>
      Lib.displayInfo(summaryQuery, SUMMARY_STAGE, candidate).displayName ===
      name,
  );
  const filter = getMeasureFilters(summaryQuery, name)[0];
  if (!column) {
    return null;
  }
  return (
    <FilterPickerBody
      query={summaryQuery}
      stageIndex={SUMMARY_STAGE}
      column={column}
      filter={filter}
      isNew={!filter}
      onBack={onBack}
      onChange={(clause) => {
        const nextClause = toFilterClause(summaryQuery, SUMMARY_STAGE, clause);
        onChange(
          filter
            ? Lib.replaceClause(summaryQuery, SUMMARY_STAGE, filter, nextClause)
            : Lib.filter(summaryQuery, SUMMARY_STAGE, nextClause),
        );
      }}
    />
  );
}

/** Splits into series, or, already split, changes what the series are. */
function splitBy(
  query: Lib.Query,
  seriesBreakout: Lib.BreakoutClause | undefined,
  column: Lib.ColumnMetadata,
): Lib.Query {
  return seriesBreakout
    ? Lib.replaceClause(query, ROWS_STAGE, seriesBreakout, column)
    : Lib.breakout(query, ROWS_STAGE, column);
}

function getName(
  query: Lib.Query,
  clause: Lib.AggregationClause | Lib.BreakoutClause,
): string {
  return Lib.displayInfo(query, ROWS_STAGE, clause).displayName;
}

/** "Created At", not "Created At: Month": what a row filter is on. */
function getUnbucketedName(
  query: Lib.Query,
  column: Lib.ColumnMetadata | null,
): string | undefined {
  if (!column) {
    return undefined;
  }
  const unbucketed = Lib.withBinning(
    Lib.withTemporalBucket(column, null),
    null,
  );
  return Lib.displayInfo(query, ROWS_STAGE, unbucketed).longDisplayName;
}

function getBuckets(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): Lib.Bucket[] {
  const temporal = Lib.availableTemporalBuckets(query, ROWS_STAGE, column);
  return temporal.length > 0
    ? temporal
    : Lib.availableBinningStrategies(query, ROWS_STAGE, column);
}

function getSortDirection(
  query: Lib.Query,
  name: string,
): Lib.OrderByDirection | undefined {
  const orderBy = Lib.orderBys(query, ROWS_STAGE).find(
    (clause) => Lib.displayInfo(query, ROWS_STAGE, clause).displayName === name,
  );
  return orderBy
    ? Lib.displayInfo(query, ROWS_STAGE, orderBy).direction
    : undefined;
}

function sortBy(
  query: Lib.Query,
  name: string,
  direction: Lib.OrderByDirection,
): Lib.Query {
  const unsorted = Lib.removeOrderBys(query, ROWS_STAGE);
  const column = Lib.orderableColumns(unsorted, ROWS_STAGE).find(
    (candidate) =>
      Lib.displayInfo(unsorted, ROWS_STAGE, candidate).displayName === name,
  );
  return column ? Lib.orderBy(unsorted, ROWS_STAGE, column, direction) : query;
}

function getMeasureFilters(
  summaryQuery: Lib.Query,
  name: string,
): Lib.FilterClause[] {
  return Lib.filters(summaryQuery, SUMMARY_STAGE).filter((filter) => {
    const column = Lib.numberFilterParts(
      summaryQuery,
      SUMMARY_STAGE,
      filter,
    )?.column;
    return (
      column != null &&
      Lib.displayInfo(summaryQuery, SUMMARY_STAGE, column).displayName === name
    );
  });
}

const OPERATOR_SYMBOLS: Partial<Record<Lib.NumberFilterOperator, string>> = {
  "=": "=",
  "!=": "≠",
  ">": ">",
  "<": "<",
  ">=": "≥",
  "<=": "≤",
};

/** "≥ 3": the menu already names the measure. */
function describeMeasureFilters(
  query: Lib.Query,
  name: string,
): string | undefined {
  if (Lib.stageCount(query) <= SUMMARY_STAGE) {
    return undefined;
  }
  const descriptions = getMeasureFilters(query, name).map((filter) => {
    const parts = Lib.numberFilterParts(query, SUMMARY_STAGE, filter);
    const symbol = parts ? OPERATOR_SYMBOLS[parts.operator] : undefined;
    return parts && symbol && parts.values.length === 1
      ? `${symbol} ${parts.values[0].toLocaleString()}`
      : Lib.displayInfo(query, SUMMARY_STAGE, filter).displayName;
  });
  return descriptions.length > 0 ? descriptions.join(", ") : undefined;
}
