import { t } from "ttag";

import type { QueryEditorUiOptions } from "metabase/querying/editor/types";
import type { Database } from "metabase-types/api";

import { doesDatabaseSupportTransforms } from "../../utils";

export function getEditorOptions(
  databases: Database[],
  readOnly?: boolean,
): QueryEditorUiOptions {
  return {
    canConvertToNative: true,
    convertToNativeTitle: t`SQL for this transform`,
    convertToNativeButtonLabel: t`Convert this transform to SQL`,
    disableMaxResults: true,
    shouldDisableDatabasePickerItem: (item) => {
      const database = databases.find((database) => database.id === item.id);
      return !doesDatabaseSupportTransforms(database);
    },
    shouldDisableDataPickerItem: (item) => {
      if (item.model === "database") {
        const database = databases.find((db) => db.id === item.id);
        return !doesDatabaseSupportTransforms(database);
      }

      if (
        item.model === "card" ||
        item.model === "dataset" ||
        item.model === "metric" ||
        item.model === "table"
      ) {
        const databaseId = "db_id" in item ? item.db_id : item.database_id;
        const database = databases.find((db) => db.id === databaseId);
        return !doesDatabaseSupportTransforms(database);
      }

      if (item.model === "dashboard") {
        return true;
      }

      return false;
    },
    shouldShowLibrary: false,
    readOnly,
  };
}
