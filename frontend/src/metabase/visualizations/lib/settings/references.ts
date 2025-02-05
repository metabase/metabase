import type {
  CardId,
  Dataset,
  VizSettingColumnReference,
} from "metabase-types/api";

export function resolveVizSettingValueReference(
  ref: VizSettingColumnReference,
  datasets: Record<CardId, Dataset>,
) {
  const dataset = datasets[ref.card_id];
  const columnIndex = dataset?.data?.cols.findIndex(
    col => col.name === ref.column_name,
  );
  return dataset?.data?.rows?.[0]?.[columnIndex];
}
