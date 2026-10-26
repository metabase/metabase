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
import { getAggregationColumns, useSummaryStage } from "./summary";

type SummaryPillsProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

/**
 * The filters on the summary as a separate zone after the expression: plain
 * AND-ed pills, added through their own button, applied at once. Renders
 * nothing while the stage has no summary.
 */
export function SummaryPills({
  query,
  stageIndex,
  onChange,
}: SummaryPillsProps) {
  const compactReading = useContext(CompactReadingContext);
  const summary = useSummaryStage(query, stageIndex);
  const filters = useMemo(
    () => (summary ? Lib.filters(summary.query, summary.stageIndex) : []),
    [summary],
  );
  const columns = useMemo(
    () => (summary ? getAggregationColumns(query, stageIndex, summary) : []),
    [query, stageIndex, summary],
  );
  const zoneRef = useSummaryZonePlacement();

  if (!summary) {
    return null;
  }

  const commit = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

  return (
    <Group ref={zoneRef} gap="xs" wrap="wrap" className={S.summaryZone}>
      {filters.map((filter, index) => (
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
        query={summary.query}
        stageIndex={summary.stageIndex}
        columns={columns}
        isFirst={filters.length === 0}
        onAdd={(filterable) =>
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
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  isFirst: boolean;
  onAdd: (filterable: Lib.Filterable) => void;
};

/** A button that opens the summary's aggregations, then the picked column's filter widget. */
function AddSummaryFilter({
  query,
  stageIndex,
  columns,
  isFirst,
  onAdd,
}: AddSummaryFilterProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [column, setColumn] = useState<Lib.ColumnMetadata>();

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
            query={query}
            stageIndex={stageIndex}
            column={column}
            isNew
            onChange={(filterable) => {
              onAdd(filterable);
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
                    Lib.displayInfo(query, stageIndex, candidate)
                      .longDisplayName
                  }
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
