import type { MetabaseVisualizationClickEvent } from "embedding-sdk/types/custom-click-actions";
import type { ClickObject } from "metabase-lib";

export function transformSdkClickObject(
  clicked: ClickObject,
): MetabaseVisualizationClickEvent {
  const column = clicked.column && {
    id: clicked.column.id,
    name: clicked.column.name,
    displayName: clicked.column.display_name,
  };

  return {
    type: "table",
    value: clicked.value,
    column,
  };
}
