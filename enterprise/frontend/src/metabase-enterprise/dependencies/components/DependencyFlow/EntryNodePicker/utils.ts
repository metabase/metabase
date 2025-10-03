import type { DataPickerValue } from "metabase/common/components/Pickers/DataPicker";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  CardType,
  DependencyEntry,
  DependencyNode,
  TableId,
} from "metabase-types/api";

function getDataPickerModel(type: CardType) {
  switch (type) {
    case "question":
      return "card";
    case "model":
      return "dataset";
    case "metric":
      return "metric";
  }
}

export function getDataPickerValue(
  node: DependencyNode,
): DataPickerValue | undefined {
  switch (node.type) {
    case "table":
      return {
        id: node.id,
        model: "table",
        name: node.data.name,
        db_id: node.data.db_id,
        schema: node.data.schema ?? "",
      };
    case "card":
      return {
        id: node.id,
        model: getDataPickerModel(node.data.type),
        name: node.data.name,
        database_id: node.data.database_id,
      };
  }
}

export function getDependencyEntry(tableId: TableId): DependencyEntry {
  const cardId = getQuestionIdFromVirtualTableId(tableId);
  return cardId != null
    ? { id: cardId, type: "card" }
    : { id: Number(tableId), type: "table" };
}
