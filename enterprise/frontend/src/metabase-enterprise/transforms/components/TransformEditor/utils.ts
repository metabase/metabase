import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DataPickerItem } from "metabase/common/components/Pickers/DataPicker";
import type { Database, DatabaseId, RecentItem } from "metabase-types/api";

import { doesDatabaseSupportTransforms } from "../../utils";

export function shouldDisableItem(
  item: DataPickerItem | CollectionPickerItem | RecentItem,
  databases: Database[],
) {
  // Disable unsupported databases
  if (item.model === "database") {
    const database = databases.find((db) => db.id === item.id);
    return !doesDatabaseSupportTransforms(database);
  }

  if (
    // Disable questions based on unsupported databases
    item.model === "card" ||
    item.model === "dataset" ||
    item.model === "metric" ||
    // Disable tables based on unsupported databases
    item.model === "table"
  ) {
    if ("database_id" in item) {
      const database = databases.find((db) => db.id === item.database_id);
      return !doesDatabaseSupportTransforms(database);
    }
    if ("database" in item) {
      const database = databases.find((db) => db.id === item.database.id);
      return !doesDatabaseSupportTransforms(database);
    }
  }

  // Disable dashboards altogether
  return item.model === "dashboard";
}

export function shouldDisableDatabase(
  databaseId: DatabaseId,
  databases: Database[],
) {
  const database = databases.find((database) => database.id === databaseId);
  return !doesDatabaseSupportTransforms(database);
}
