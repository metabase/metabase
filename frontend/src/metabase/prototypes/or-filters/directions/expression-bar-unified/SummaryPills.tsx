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
type SummaryColumn = {
  summary: SummaryStage;
  column: Lib.ColumnMetadata;
};

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
  const summaries = useSummaryStages(query, stageIndex);
  const filters = useMemo(
    () =>
      summaries.flatMap((summary) =>
        Lib.filters(summary.query, summary.stageIndex).map((filter) => ({
          summary,
          filter,
        })),
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
  const zoneRef = useSummaryZonePlacement();

  if (summaries.length === 0) {
    return null;
  }

  const commit = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

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
        isFirst={filters.length === 0}
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
function useSummaryZonePlacement() {
  const zoneRef = useRef<HTMLDivElement>(null);
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
  isFirst: boolean;
  onAdd: (column: SummaryColumn, filterable: Lib.Filterable) => void;
};

/** A button that opens the summaries' aggregations, then the picked column's filter widget. */
function AddSummaryFilter({
  columns,
  summaryCount,
  isFirst,
  onAdd,
}: AddSummaryFilterProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [column, setColumn] = useState<SummaryColumn>();

  const close = () => {
    setIsOpened(false);
    setColumn(undefined);
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={(opened) => !opened && close()}
    >
      <Popover.Target>
        <Button
          size="compact-sm"
          variant="subtle"
          className={S.summaryAddButton}
          leftSection={<Icon name="sum" size={12} />}
          rightSection={isFirst ? undefined : <Icon name="add" size={10} />}
          onClick={() => setIsOpened((opened) => !opened)}
        >
          {isFirst ? t`Filter the summary` : undefined}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={0} style={{ overflow: "visible" }}>
        {column ? (
          <FilterPickerBody
            query={column.summary.query}
            stageIndex={column.summary.stageIndex}
            column={column.column}
            isNew
            onChange={(filterable) => {
              onAdd(column, filterable);
              close();
            }}
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
                <Icon
                  name="sum"
                  size={18}
                  className={S.suggestionSummaryIcon}
                />
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
                  <Text
                    size="sm"
                    c="text-secondary"
                    className={S.suggestionHint}
                  >
                    {t`summary ${candidate.summary.stageIndex}`}
                  </Text>
                )}
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
