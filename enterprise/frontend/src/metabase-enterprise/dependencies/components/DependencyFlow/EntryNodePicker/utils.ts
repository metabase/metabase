import type { DataPickerValue } from "metabase/common/components/Pickers/DataPicker";
import { checkNotNull } from "metabase/lib/types";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  Card,
  CardId,
  CardType,
  DependencyEntry,
  DependencyGraph,
  DependencyNode,
  TableId,
} from "metabase-types/api";

export function findNode(graph: DependencyGraph, entry: DependencyEntry) {
  return graph.nodes.find(
    (node) => node.id === entry.id && node.type === entry.type,
  );
}

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
    case "question":
    case "model":
    case "metric":
      return {
        id: node.id,
        model: getDataPickerModel(node.type),
        name: node.data.name,
        database_id: node.data.database_id ?? 0,
      };
  }
}

export async function getDependencyEntry(
  tableId: TableId,
  getCard: (cardId: CardId) => Promise<Card>,
): Promise<DependencyEntry> {
  if (typeof tableId === "number") {
    return { id: tableId, type: "table" };
  }
  const cardId = checkNotNull(getQuestionIdFromVirtualTableId(tableId));
  const card = await getCard(cardId);
  return { id: cardId, type: card.type };
}
