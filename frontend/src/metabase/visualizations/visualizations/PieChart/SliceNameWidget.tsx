import { Box } from "metabase/ui";
import type { PieRow } from "metabase-types/api";

import { SliceNameInput } from "./SliceNameWidget.styled";

// The widget only reads these fields, so any row shape that carries them works
// (PieRow for pie, TreemapRow for treemap).
type NameableRow = Pick<PieRow, "key" | "name" | "originalName">;

export type SliceNameWidgetProps = {
  initialKey: string | number;
  pieRows: NameableRow[];
  updateRowName: (newName: string, key: string | number) => void;
};

export function SliceNameWidget({
  initialKey,
  pieRows,
  updateRowName,
}: SliceNameWidgetProps) {
  if (pieRows.length === 0) {
    return null;
  }

  const row = pieRows.find((row) => row.key === initialKey);
  if (row == null) {
    return null;
  }

  return (
    // Bottom padding is needed since the popover has 1.5rem top padding, but
    // only 1rem bottom padding
    <Box w="100%" pb="0.5rem">
      <SliceNameInput
        value={row.name}
        description={
          row.name !== row.originalName ? row.originalName : undefined
        }
        onBlurChange={(event) => {
          const newName = event.target.value;

          if (newName !== row.name) {
            updateRowName(newName, row.key);
          }
        }}
      />
    </Box>
  );
}
