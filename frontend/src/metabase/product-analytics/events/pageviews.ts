import { t } from "ttag";

import * as Lib from "metabase-lib";
import { isNumber } from "metabase-lib/v1/types/utils/isa";
import type { Table } from "metabase-types/api";

import { findColumn } from "../find-column";

import type { EventDefinition } from "./types";

const STAGE = -1;

/** Umami's, and so Metabase Track's: 1 is a pageview, 2 a custom event. */
const UMAMI_EVENT_TYPE = { column: "event_type", pageview: 1 };

/**
 * The pageviews in an event table whose schema we recognize. Undefined when
 * we don't, or until the table's metadata is loaded.
 */
export const detectPageviews = (
  metadataProvider: Lib.MetadataProvider,
  table: Table | undefined,
): EventDefinition | undefined => {
  const hasEventType = (table?.fields ?? []).some(
    (field) => field.name === UMAMI_EVENT_TYPE.column && isNumber(field),
  );
  const tableMetadata =
    table !== undefined && hasEventType
      ? Lib.tableOrCardMetadata(metadataProvider, table.id)
      : null;
  if (tableMetadata === null) {
    return undefined;
  }
  const query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableMetadata,
  );
  const filter = Lib.numberFilterClause({
    operator: "=",
    column: findColumn(query, UMAMI_EVENT_TYPE.column),
    values: [UMAMI_EVENT_TYPE.pageview],
  });
  return {
    name: t`Pageview`,
    query: Lib.toJsQuery(Lib.filter(query, STAGE, filter)),
  };
};
