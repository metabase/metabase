import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { useDefinitionClauses } from "../ClausePills";
import { ListSection } from "../ListSection";

import { MeasureItem } from "./MeasureItem";

/**
 * A table's existing measures as plain cards, each opening its page to view
 * or edit. Creating measures, groups and proposals live with published tables.
 */
export function SimpleMeasureList({ table }: { table: Table }) {
  const getClauses = useDefinitionClauses(table);

  return (
    <ListSection>
      {(table.measures ?? []).map((measure) => (
        <MeasureItem
          key={measure.id}
          measure={measure}
          href={Urls.dataStudioDataModelMeasure({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
            measureId: measure.id,
          })}
          clauses={getClauses(measure.definition)}
        />
      ))}
    </ListSection>
  );
}
