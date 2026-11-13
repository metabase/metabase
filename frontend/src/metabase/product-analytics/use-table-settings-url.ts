import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { useSelector } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

/**
 * The table's event settings in Data Studio, for someone who can open Data
 * Studio and edit the table; undefined for anyone else.
 */
export const useTableSettingsUrl = (
  table: Table | undefined,
): string | undefined => {
  const hasDataStudioAccess = useSelector(canAccessDataStudio);
  return table !== undefined && table.can_write && hasDataStudioAccess
    ? Urls.dataStudioData({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
        tab: "events",
      })
    : undefined;
};
