import type { OmniPickerItem } from "metabase/common/components/Pickers";
import type { Database } from "metabase-types/api";

import { doesDatabaseSupportTransforms } from "../../utils";

export function shouldDisableItem(
  item: OmniPickerItem,
  databases?: Database[],
) {
  if (
    // Disable questions based on unsuppported databases
    item.model === "card" ||
    item.model === "dataset" ||
    item.model === "metric"
  ) {
    const database = databases?.find(
      (database) => database.id === item.database_id,
    );
    return !doesDatabaseSupportTransforms(database);
  }

  if (item.model === "dashboard") {
    return true;
  }

  return false;
}
