import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import {
  Button,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterTokenView } from "./ExpressionBar";
import S from "./ExpressionBar.module.css";
import { CompactReadingContext } from "./settings";
import {
  type SummaryStage,
  getAggregationColumns,
  useSummaryStages,
} from "./summary";

type SummaryPillsProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

/** An aggregation the zone can filter on, with the summary stage its filter lives on. */
export type SummaryColumn = {
  summary: SummaryStage;
  column: Lib.ColumnMetadata;
};

/** A filter on a summary, with the stage it lives on. */
export type SummaryFilter = {
  summary: SummaryStage;
  filter: Lib.FilterClause;
};

/**
 * What a summary-filter UI works with: the summary stages after `stageIndex`,
 * their filters in stage order, and the aggregations they can filter on.
 */
export function useSummaryFilters(query: Lib.Query, stageIndex: number) {
  const summaries = useSummaryStages(query, stageIndex);
  const filters = useMemo(
    () =>
      summaries.flatMap((summary) =>
        Lib.filters(summary.query, summary.stageIndex).map(
          (filter): SummaryFilter => ({ summary, filter }),
        ),
      ),
    [summaries],
  );
  const columns = useMemo(
    () =>
      summaries.flatMap((summary) =>
        getAggregationColumns(
          summary.query,
          summary.stageIndex - 1,
          summary,
        ).map((column): SummaryColumn => ({ summary, column })),
      ),
    [summaries],
  );
  return { summaries, filters, columns };
}

/** Applies a change to a summary stage at once, dropping a stage left empty. */
export function commitSummaryQuery(
  nextQuery: Lib.Query,
  onChange: (query: Lib.Query) => void,
) {
  onChange(Lib.dropEmptyStages(nextQuery));
}

/**
 * The filters on the summaries as a separate zone after the expression:
 * plain AND-ed pills, one summary stage after another, added through their
 * own button, applied at once. Renders nothing while the stage has no summary.
 */
export function SummaryPills({
  query,
  stageIndex,
  onChange,
}: SummaryPillsProps) {
  const compactReading = useContext(CompactReadingContext);
  const { summaries, filters, columns } = useSummaryFilters(query, stageIndex);
  const zoneRef = useSummaryZonePlacement<HTMLDivElement>();

  if (summaries.length === 0) {
    return null;
  }

  const commit = (nextQuery: Lib.Query) =>
    commitSummaryQuery(nextQuery, onChange);

  return (
    <Group ref={zoneRef} gap="xs" wrap="wrap" className={S.summaryZone}>
      {filters.map(({ summary, filter }, index) => (
        <FilterTokenView
          key={index}
          query={summary.query}
          stageIndex={summary.stageIndex}
          isSummary
          compact={compactReading}
          clause={filter}
          onReplace={(filterable) =>
            commit(
              Lib.replaceClause(
                summary.query,
                summary.stageIndex,
                filter,
                filterable,
              ),
            )
          }
          onRemove={() =>
            commit(Lib.removeClause(summary.query, summary.stageIndex, filter))
          }
        />
      ))}
      <AddSummaryFilter
        columns={columns}
        summaryCount={summaries.length}
        label={filters.length === 0 ? t`Filter the summary` : undefined}
        onAdd={({ summary }, filterable) =>
          commit(Lib.filter(summary.query, summary.stageIndex, filterable))
        }
      />
    </Group>
  );
}

/**
 * The zone keeps to the right of the expression while it shares a line with
 * it; once it wraps onto a line of its own it starts at the left, like a
 * wrapped token. CSS cannot tell the two apart, so the zone is measured in
 * its right-aligned state after every render and bar resize.
 */
export function useSummaryZonePlacement<T extends HTMLElement>() {
  const zoneRef = useRef<T>(null);
  useLayoutEffect(() => {
    const zone = zoneRef.current;
    const bar = zone?.parentElement;
    if (!zone || !bar) {
      return;
    }
    const place = () => {
      zone.classList.remove(S.summaryZoneOwnLine);
      const previous = zone.previousElementSibling;
      // Items sharing a line overlap vertically; a wrapped zone starts below the previous item.
      const isOwnLine =
        previous instanceof HTMLElement &&
        zone.offsetTop >= previous.offsetTop + previous.offsetHeight;
      zone.classList.toggle(S.summaryZoneOwnLine, isOwnLine);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(bar);
    return () => observer.disconnect();
  });
  return zoneRef;
}

type AddSummaryFilterProps = {
  columns: SummaryColumn[];
  /** How many summaries the columns come from; above one, each column says which. */
  summaryCount: number;
  /** The button's text; without one it is a bare Σ+ icon. */
  label?: string;
  /** Inside another popover: renders the picker within it, so clicks there do not close the parent. */
  isNested?: boolean;
  onAdd: (column: SummaryColumn, filterable: Lib.Filterable) => void;
};

/** A button that opens the summaries' aggregations, then the picked column's filter widget. */
export function AddSummaryFilter({
  columns,
  summaryCount,
  label,
  isNested = false,
  onAdd,
}: AddSummaryFilterProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      withinPortal={!isNested}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Button
          size="compact-sm"
          variant="subtle"
          className={S.summaryAddButton}
          leftSection={<Icon name="sum" size={12} />}
          rightSection={label ? undefined : <Icon name="add" size={10} />}
          onClick={() => setIsOpened((opened) => !opened)}
        >
          {label}
        </Button>
      </Popover.Target>
      <AddSummaryFilterDropdown
        columns={columns}
        summaryCount={summaryCount}
        onAdd={(column, filterable) => {
          onAdd(column, filterable);
          setIsOpened(false);
        }}
      />
    </Popover>
  );
}

type AddSummaryFilterDropdownProps = Pick<
  AddSummaryFilterProps,
  "columns" | "summaryCount" | "onAdd"
>;

/**
 * The dropdown of a popover that adds a filter on a summary: the aggregations,
 * then the picked one's filter widget. The picked column resets with the
 * popover, which unmounts its dropdown when closed.
 */
export function AddSummaryFilterDropdown({
  columns,
  summaryCount,
  onAdd,
}: AddSummaryFilterDropdownProps) {
  const [column, setColumn] = useState<SummaryColumn>();

  return (
    <Popover.Dropdown p={0} style={{ overflow: "visible" }}>
      {column ? (
        <FilterPickerBody
          query={column.summary.query}
          stageIndex={column.summary.stageIndex}
          column={column.column}
          isNew
          onChange={(filterable) => onAdd(column, filterable)}
          onBack={() => setColumn(undefined)}
        />
      ) : (
        <Stack gap={0} py="xs" miw={280}>
          <Text size="xs" c="text-secondary" px="sm" py="xs">
            {t`Applies after summarizing`}
          </Text>
          {columns.map((candidate, index) => (
            <UnstyledButton
              key={index}
              className={S.suggestion}
              onClick={() => setColumn(candidate)}
            >
              <Icon name="sum" size={18} className={S.suggestionSummaryIcon} />
              <Text fw="bold" className={S.suggestionTitle}>
                {
                  Lib.displayInfo(
                    candidate.summary.query,
                    candidate.summary.stageIndex,
                    candidate.column,
                  ).longDisplayName
                }
              </Text>
              {summaryCount > 1 && (
                <Text size="sm" c="text-secondary" className={S.suggestionHint}>
                  {t`summary ${candidate.summary.stageIndex}`}
                </Text>
              )}
            </UnstyledButton>
          ))}
        </Stack>
      )}
    </Popover.Dropdown>
  );
}
