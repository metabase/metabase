import type { Table, TableId } from "metabase-types/api";

/** How the event table reaches the table of the people behind its events. */
export type UsersTableLink = {
  tableId: TableId;
  /** The event table column that holds the people table key. */
  foreignKey: string;
  /** The people table column the foreign key points to. */
  primaryKey: string;
};

/**
 * The people table the person column's foreign key points to. Only the
 * person column's: a person's segments and properties have to be the same on
 * all their events, anonymous ones included, which a stitched person column
 * gives and a foreign key elsewhere, like GA4's `user_id`, doesn't.
 */
export const getUsersTableLink = (
  table: Table | undefined,
  personColumn: string | null,
): UsersTableLink | undefined => {
  const field = table?.fields?.find((item) => item.name === personColumn);
  // `query_metadata` sends `target: null` on fields without a foreign key.
  const target = field?.target;
  return field !== undefined && target != null && target.table_id !== table?.id
    ? {
        tableId: target.table_id,
        foreignKey: field.name,
        primaryKey: target.name,
      }
    : undefined;
};
