import { useMemo } from "react";

import { skipToken, useGetFieldValuesQuery } from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Table } from "metabase-types/api";

import {
  findEventNameColumn,
  formatEventName,
  getEventNameFieldId,
  getEventNameValue,
  withEventNameCondition,
} from "../events/event-name";

import { readSegmentDefinition } from "./to-event-definition";
import type {
  DraftPaletteSegment,
  SavedPaletteSegment,
  SegmentDraft,
} from "./types";

type EventNameSeedsOptions = {
  /** The event table; undefined for none, e.g. in the people panel. */
  table: Table | undefined;
  tableQuery: Lib.Query | undefined;
  saved: SavedPaletteSegment[];
  drafts: SegmentDraft[];
};

/**
 * A draft per event name the table's event name column has values for, e.g.
 * "Signup" for event name is signup. An event name a saved segment or one of
 * the user's drafts already picks, and nothing else, gets none. Empty without
 * an event name column or its values, which are as current as the last scan.
 */
export const useEventNameSeeds = ({
  table,
  tableQuery,
  saved,
  drafts,
}: EventNameSeedsOptions): DraftPaletteSegment[] => {
  const eventNameFieldId = getEventNameFieldId(table);
  const { data } = useGetFieldValuesQuery(eventNameFieldId ?? skipToken);
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);

  return useMemo(() => {
    if (
      eventNameFieldId === undefined ||
      tableQuery === undefined ||
      data === undefined
    ) {
      return [];
    }
    const getPickedName = (definition: DatasetQuery) => {
      const query = readSegmentDefinition(metadataProvider, definition);
      return query !== undefined
        ? getEventNameValue(query, eventNameFieldId)
        : null;
    };
    const picked = new Set([
      ...saved.map(({ segment }) => getPickedName(segment.definition)),
      ...drafts.map((draft) => getPickedName(draft.query)),
    ]);
    const column = findEventNameColumn(tableQuery, eventNameFieldId);
    if (column === undefined) {
      return [];
    }
    return data.values
      .map(([value]) => value)
      .filter(
        (value): value is string =>
          typeof value === "string" &&
          value.trim() !== "" &&
          !picked.has(value),
      )
      .map((value) => ({
        key: `seed-event-name-${value}`,
        source: "event",
        status: "draft",
        name: formatEventName(value),
        query: Lib.toJsQuery(withEventNameCondition(tableQuery, column, value)),
        isSeed: true,
      }));
  }, [eventNameFieldId, tableQuery, data, metadataProvider, saved, drafts]);
};
