import type { QuestionPickerItem } from "metabase/common/components/Pickers/QuestionPicker";
import type { Database } from "metabase-types/api";

import { doesDatabaseSupportTransforms } from "../../utils";

export function shouldDisableItem(
  item: QuestionPickerItem,
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
