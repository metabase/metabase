import { useCallback, useMemo } from "react";

import type {
  ColumnGroupItemsContext,
  CustomListItem,
} from "metabase/querying/filters/components/FilterPicker/types";
import * as Lib from "metabase-lib";

import type { UsersTable } from "../analyses/types";

import { isTableColumnGroup, toSegmentPickerItem } from "./picker-items";
import type { PaletteSegment } from "./types";
import { toDraftPaletteSegment } from "./use-palette-segments";
import { usePeoplePickerSegments } from "./use-people-picker-segments";
import { useSegmentDrafts } from "./use-segment-drafts";

type SegmentPickerItemsOptions = {
  /** The event query the picker filters. */
  query: Lib.Query;
  /**
   * Lists this session's drafts of event segments in the event table's
   * group. The picker lists the saved ones itself.
   */
  withEventDrafts?: boolean;
  /** The linked people table, whose saved segments and drafts go in its group. */
  usersTable?: UsersTable;
};

/**
 * The segments a column picker lists beyond its own, as items for its groups,
 * and a lookup from a picked item back to its segment.
 */
export const useSegmentPickerItems = ({
  query,
  withEventDrafts = false,
  usersTable,
}: SegmentPickerItemsOptions) => {
  const { drafts } = useSegmentDrafts(
    Lib.primarySourceTableId(query) ?? undefined,
  );
  const eventDrafts = useMemo(
    () =>
      withEventDrafts
        ? drafts.map((draft) => toDraftPaletteSegment(draft, "event"))
        : [],
    [withEventDrafts, drafts],
  );
  const peopleSegments = usePeoplePickerSegments(usersTable);

  const getGroupItems = useCallback(
    ({ info, columns }: ColumnGroupItemsContext): CustomListItem[] => {
      if (info.isSourceTable) {
        return eventDrafts.map(toSegmentPickerItem);
      }
      const isPeopleGroup =
        usersTable !== undefined &&
        isTableColumnGroup(query, columns, usersTable.table);
      return isPeopleGroup ? peopleSegments.map(toSegmentPickerItem) : [];
    },
    [query, usersTable, eventDrafts, peopleSegments],
  );

  const segments = useMemo(
    () => [...eventDrafts, ...peopleSegments],
    [eventDrafts, peopleSegments],
  );
  const findSegment = useCallback(
    (item: CustomListItem): PaletteSegment | undefined =>
      segments.find(({ key }) => key === item.key),
    [segments],
  );

  return { getGroupItems, findSegment };
};
