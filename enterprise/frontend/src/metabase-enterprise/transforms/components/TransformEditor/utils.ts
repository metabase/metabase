import { t } from "ttag";

import type { QueryEditorUiOptions } from "metabase/querying/editor/types";
import type { Database } from "metabase-types/api";

import { doesDatabaseSupportTransforms } from "../../utils";

export function getEditorOptions(databases: Database[]): QueryEditorUiOptions {
  return {
    canConvertToNative: true,
    convertToNativeTitle: t`SQL for this transform`,
    convertToNativeButtonLabel: t`Convert this transform to SQL`,
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
        const database = databases.find((db) => db.id === item.database_id);
        return !doesDatabaseSupportTransforms(database);
      }

      if (item.model === "dashboard") {
        return true;
      }

      return false;
    },
  };
}
