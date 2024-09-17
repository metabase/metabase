import { Box } from "metabase/ui";
import type { PieRow } from "metabase/visualizations/echarts/pie/model/types";

import { SliceNameInput } from "./SliceNameWidget.styled";

export function SliceNameWidget({
  initialKey,
  pieRows,
  updateRowName,
}: {
  initialKey: string | number;
  pieRows: PieRow[];
  updateRowName: (newName: string, key: string | number) => void;
}) {
  if (pieRows.length === 0) {
    return null;
  }

  const row = pieRows.find(row => row.key === initialKey);
  if (row == null) {
    return null;
  }

  return (
    // Bottom padding is needed since the popover has 1.5rem top padding, but
    // only 1rem bottom padding
    <Box w="100%" pb="0.5rem">
      <SliceNameInput
        value={row.name}
        subtitle={row.name !== row.originalName ? row.originalName : undefined}
        onBlurChange={event => {
          const newName = event.target.value;

          if (newName !== row.name) {
            updateRowName(newName, row.key);
          }
        }}
      />
    </Box>
  );
}
