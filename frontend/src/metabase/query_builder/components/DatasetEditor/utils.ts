import { getIconForField } from "metabase/lib/schema_metadata";

type Column = {
  semantic_type?: string;
};

export function getColumnTypeIcon(column?: Column): string {
  // getIconForField can pick an icon based on `base_type` or `effective_type`,
  // but in the editor UI we only want to check the `semantic_type` to indicate which columns are still missing it
  const icon = getIconForField({ semantic_type: column?.semantic_type });
  return icon !== "unknown" ? icon : "ellipsis";
}
