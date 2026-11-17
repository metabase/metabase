import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { useDefinitionClauses } from "../ClausePills";
import { ListSection } from "../ListSection";

import { SegmentItem } from "./SegmentItem";

/**
 * A table's existing segments as plain cards, each opening its page to view
 * or edit. Creating segments, groups and proposals live with published tables.
 */
export function SimpleSegmentList({ table }: { table: Table }) {
  const getClauses = useDefinitionClauses(table);

  return (
    <ListSection>
      {(table.segments ?? []).map((segment) => (
        <SegmentItem
          key={segment.id}
          segment={segment}
          href={Urls.dataStudioDataModelSegment({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
            segmentId: segment.id,
          })}
          clauses={getClauses(segment.definition)}
        />
      ))}
    </ListSection>
  );
}
