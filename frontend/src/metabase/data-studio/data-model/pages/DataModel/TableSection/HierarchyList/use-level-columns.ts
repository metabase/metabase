import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import type { HierarchyLevel } from "metabase/metadata/hierarchies";
import { useSchemaTables } from "metabase/metadata/table-structure";
import * as Lib from "metabase-lib";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, IconName, Table } from "metabase-types/api";

/** A column a hierarchy level can use, with how to show and pick it */
export type LevelColumn = {
  /** A Select value: "<fieldId>", or "<viaFieldId>:<fieldId>" through a key */
  value: string;
  level: HierarchyLevel;
  field: Field;
  label: string;
  icon: IconName;
  /** The Select group it's listed under */
  group: string;
};

export const getLevelValue = ({ fieldId, viaFieldId }: HierarchyLevel) =>
  viaFieldId != null ? `${viaFieldId}:${fieldId}` : String(fieldId);

/** The column a level uses, if the table still has it */
export type FindLevelColumn = (
  level: HierarchyLevel,
) => LevelColumn | undefined;

/** "Account ID" → "Account", the name a key's columns are listed under */
const getKeyName = (field: Field) => field.display_name.replace(/\s+ID$/i, "");

/**
 * The table's own columns, then the columns of each table a foreign key
 * points to, which a level can reach through that key (doc 06)
 */
export function useLevelColumns(table: Table) {
  const { tables } = useSchemaTables(table);
  const columns = useMemo((): LevelColumn[] => {
    const fields = table.fields ?? [];
    const own = fields.map(
      (field): LevelColumn => ({
        value: String(field.id),
        level: { fieldId: field.id },
        field,
        label: field.display_name,
        icon: getColumnIcon(Lib.legacyColumnTypeInfo(field)),
        group: t`This table`,
      }),
    );
    const reached = fields.flatMap((key) => {
      const targetTableId = key.target?.table_id;
      if (targetTableId == null || targetTableId === table.id) {
        return [];
      }
      const target = tables.find(({ id }) => id === targetTableId);
      return (target?.fields ?? [])
        .filter((field) => !isPK(field))
        .map(
          (field): LevelColumn => ({
            value: `${key.id}:${field.id}`,
            level: { fieldId: field.id, viaFieldId: key.id },
            field,
            label: `${getKeyName(key)} › ${field.display_name}`,
            icon: getColumnIcon(Lib.legacyColumnTypeInfo(field)),
            group: t`Through ${key.display_name}`,
          }),
        );
    });
    return [...own, ...reached];
  }, [table, tables]);

  const findColumn = useCallback<FindLevelColumn>(
    (level) => columns.find(({ value }) => value === getLevelValue(level)),
    [columns],
  );

  return { columns, findColumn };
}
