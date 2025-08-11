import { type ReactNode, useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { foreignKeyCountsByOriginTable } from "metabase/lib/schema_metadata";
import { question } from "metabase/lib/urls";
import { type BoxProps, Stack, Text, rem } from "metabase/ui";
import type { ForeignKeyReferences } from "metabase/visualizations/components/ObjectDetail/types";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ForeignKey,
  RowValues,
  Table,
} from "metabase-types/api";

import { Relationship } from "./Relationship";

interface Props {
  columns: DatasetColumn[];
  row: RowValues;
  rowName: ReactNode;
  table: Table;
  tableForeignKeys: ForeignKey[];
  tableForeignKeyReferences: ForeignKeyReferences;
}

export function Relationships({
  columns,
  row,
  rowName,
  table,
  tableForeignKeys,
  tableForeignKeyReferences,
}: Props & BoxProps): JSX.Element | null {
  const dispatch = useDispatch();

  const fkCountsByTable = useMemo(
    () => foreignKeyCountsByOriginTable(tableForeignKeys),
    [tableForeignKeys],
  );

  const sortedForeignTables = useMemo(
    () =>
      tableForeignKeys?.toSorted((a, b) => {
        const aDisplayName = a.origin?.table?.display_name ?? "";
        const bDisplayName = b.origin?.table?.display_name ?? "";
        return aDisplayName.localeCompare(bDisplayName);
      }),
    [tableForeignKeys],
  );

  const handleFkClick = useCallback(
    (fk: ForeignKey) => {
      const pkIndex = columns.findIndex(isPK);

      if (pkIndex === -1) {
        return;
      }

      const objectId = row[pkIndex];

      if (objectId == null) {
        return;
      }

      if (fk.origin?.table_id) {
        const card = {
          type: "question" as const,
          dataset_query: {
            type: "query" as const,
            query: {
              "source-table": fk.origin.table_id,
              filter: ["=", ["field", fk.origin.id, null], objectId],
            },
            database: fk.origin.table?.db_id || table.db_id,
          },
        };

        const questionUrl = question(card, { hash: card as any });
        dispatch(push(questionUrl));
      }
    },
    [row, columns, table.db_id, dispatch],
  );

  if (!tableForeignKeys || !tableForeignKeys?.length) {
    return null;
  }

  return (
    <Stack gap="md" p={rem(40)}>
      <Text
        c="text-secondary"
        fw="bold"
        fz={17}
      >{t`${rowName} is connected to:`}</Text>

      <Stack gap="md">
        {sortedForeignTables?.map((fk) => (
          <Relationship
            key={`${fk.origin_id}-${fk.destination_id}`}
            fk={fk}
            fkCount={
              (fk.origin?.table != null &&
                fkCountsByTable?.[fk.origin.table?.id]) ||
              0
            }
            fkCountInfo={
              fk.origin?.id != null
                ? tableForeignKeyReferences?.[Number(fk.origin.id)]
                : undefined
            }
            onClick={handleFkClick}
          />
        ))}
      </Stack>
    </Stack>
  );
}
