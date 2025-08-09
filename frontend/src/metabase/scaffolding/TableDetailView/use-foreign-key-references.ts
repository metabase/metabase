import { useCallback, useEffect, useState } from "react";

import { MetabaseApi } from "metabase/services";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValues } from "metabase-types/api";

interface ForeignKeyReference {
  status: number;
  value: number;
}

interface UseForeignKeyReferencesProps {
  tableForeignKeys: any[];
  row: RowValues;
  columns: DatasetColumn[];
  tableDatabaseId: number;
}

export function useForeignKeyReferences({
  tableForeignKeys,
  row,
  columns,
  tableDatabaseId,
}: UseForeignKeyReferencesProps) {
  const [tableForeignKeyReferences, setTableForeignKeyReferences] = useState<{
    [key: number]: ForeignKeyReference;
  }>({});

  const calculateFKReferences = useCallback(async () => {
    if (!tableForeignKeys.length || !row.length) {
      return;
    }

    const pkIndex = columns.findIndex(isPK);
    if (pkIndex === -1) {
      return;
    }

    const objectId = row[pkIndex];
    if (objectId == null) {
      return;
    }

    const references: { [key: number]: ForeignKeyReference } = {};

    // For each foreign key, calculate the real count
    for (const fk of tableForeignKeys as any[]) {
      if (!fk.origin?.id) {
        continue;
      }

      references[fk.origin.id] = { status: 0, value: 0 };

      try {
        const query = {
          type: "query",
          query: {
            "source-table": fk.origin.table_id,
            filter: ["=", ["field", fk.origin.id, null], objectId],
            aggregation: [["count"]],
          },
          database: fk.origin.table?.db_id || tableDatabaseId,
        };

        const response = await MetabaseApi.dataset(query);

        if (response?.data?.rows?.[0]?.[0] != null) {
          const count = response.data.rows[0][0];
          references[fk.origin.id] = {
            status: 1,
            value: count,
          };
        } else {
          references[fk.origin.id] = { status: 1, value: 0 };
        }
      } catch (error) {
        console.error(
          "Error calculating FK reference for",
          fk.origin.display_name,
          ":",
          error,
        );
        references[fk.origin.id] = { status: 1, value: 0 };
      }
    }

    setTableForeignKeyReferences(references);
  }, [tableForeignKeys, row, columns, tableDatabaseId]);

  useEffect(() => {
    calculateFKReferences();
  }, [calculateFKReferences]);

  return {
    tableForeignKeyReferences,
    calculateFKReferences,
  };
}
