import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import type { SettingWidgetProps } from "metabase/event-tables";
import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import type {
  ColumnGroupItemsContext,
  CustomListItem,
} from "metabase/querying/filters/components/FilterPicker/types";
import { Icon, Popover, UnstyledButton } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import type { UsersTable } from "../analyses/types";
import {
  type AnalysisFilters,
  readFilterQuery,
  withFilterQuery,
  withSegmentFilter,
} from "../filters";
import {
  isTableColumnGroup,
  toSegmentPickerItem,
} from "../segments/picker-items";
import { usePaletteSegments } from "../segments/use-palette-segments";
import { usePeoplePickerSegments } from "../segments/use-people-picker-segments";
import { useSegmentDrafts } from "../segments/use-segment-drafts";

import S from "./AddFilterButton.module.css";
import { useFilterCount } from "./FilterPills";
import { useTableQuery } from "./events/use-table-query";

type AddFilterButtonProps = SettingWidgetProps<AnalysisFilters> & {
  table?: Table;
  usersTable?: UsersTable;
};

/**
 * The end of the filter row: a round + after the filters, or, while there are
 * none, a "New filter" placeholder that opens its column picker right away.
 * Same picker as the query builder's, on the event table. Beyond the query
 * builder's, the event table lists this session's event drafts after its
 * segments, and the linked people table lists its segments and drafts, which
 * filter to the people in them.
 */
export const AddFilterButton = ({
  value,
  onChange,
  table,
  usersTable,
}: AddFilterButtonProps) => {
  const isEmpty = useFilterCount(value, table) === 0;
  // The row mounts when it's shown, so an empty one opens straight onto it.
  const [isOpened, { close, toggle }] = useDisclosure(isEmpty);
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const tableQuery = useTableQuery(table);
  const query = useMemo(
    () => readFilterQuery(metadataProvider, value) ?? tableQuery,
    [metadataProvider, value, tableQuery],
  );

  return (
    <Popover
      opened={isOpened && query !== undefined}
      position="bottom-start"
      onDismiss={close}
    >
      <Popover.Target>
        {isEmpty ? (
          <FilterPill onClick={toggle}>{t`New filter`}</FilterPill>
        ) : (
          <UnstyledButton
            className={S.add}
            aria-label={t`Add a filter`}
            onClick={toggle}
          >
            <Icon name="add" size={12} />
          </UnstyledButton>
        )}
      </Popover.Target>
      <Popover.Dropdown>
        {query !== undefined && (
          <FilterPickerWithSegments
            query={query}
            value={value}
            onChange={onChange}
            onClose={close}
            table={table}
            usersTable={usersTable}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
};

type FilterPickerWithSegmentsProps = {
  query: Lib.Query;
  value: AnalysisFilters;
  onChange: (value: AnalysisFilters) => void;
  onClose: () => void;
  table: Table | undefined;
  usersTable: UsersTable | undefined;
};

/** The filter picker with the segments the query builder's lacks. */
const FilterPickerWithSegments = ({
  query,
  value,
  onChange,
  onClose,
  table,
  usersTable,
}: FilterPickerWithSegmentsProps) => {
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const tableQuery = useTableQuery(table);
  const eventDrafts = useSegmentDrafts(table?.id).drafts;
  const { drafted: eventSegments } = usePaletteSegments(
    table?.id,
    "event",
    eventDrafts,
  );
  const peopleSegments = usePeoplePickerSegments(usersTable);

  const getGroupItems = useCallback(
    ({ info, columns }: ColumnGroupItemsContext): CustomListItem[] => {
      if (info.isSourceTable) {
        return eventSegments.map(toSegmentPickerItem);
      }
      return usersTable !== undefined &&
        isTableColumnGroup(query, columns, usersTable.table)
        ? peopleSegments.map(toSegmentPickerItem)
        : [];
    },
    [query, usersTable, eventSegments, peopleSegments],
  );

  const handleCustomItemSelect = (item: CustomListItem) => {
    const segment = [...peopleSegments, ...eventSegments].find(
      ({ key }) => key === item.key,
    );
    if (segment !== undefined && tableQuery !== undefined) {
      onChange(withSegmentFilter(value, segment, metadataProvider, tableQuery));
    }
  };

  return (
    <MultiStageFilterPicker
      query={query}
      canAppendStage={false}
      onChange={(newQuery) => onChange(withFilterQuery(value, newQuery))}
      onClose={onClose}
      getGroupItems={getGroupItems}
      onCustomItemSelect={handleCustomItemSelect}
    />
  );
};
