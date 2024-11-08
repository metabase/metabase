import { useDroppable } from "@dnd-kit/core";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Stack, Text } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/visualizer.slice";

import { WellItem } from "../WellItem";

export function PieDimensionWell() {
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getSettings);

  const { isOver, setNodeRef, active } = useDroppable({
    id: DROPPABLE_ID.PIE_DIMENSION,
  });

  const pieDimensions = columns.find(
    col => col.name === settings["pie.dimension"],
  );
  return (
    <Box mt="lg">
      <Text>{t`Pie chart dimensions`}</Text>
      <Box
        bg={active ? "var(--mb-color-brand-light)" : "bg-light"}
        p="sm"
        mih="120px"
        w="300px"
        mt="xs"
        style={{
          borderRadius: "var(--default-border-radius",
          overflowX: "auto",
          overflowY: "hidden",
          border: `1px solid ${active ? "var(--mb-color-brand)" : "var(--border-color)"}`,
          transform: active ? "scale(1.025)" : "scale(1)",
          transition:
            "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
          outline: isOver ? "1px solid var(--mb-color-brand)" : "none",
        }}
        ref={setNodeRef}
      >
        {pieDimensions && (
          <Stack>
            {pieDimensions.map(d => (
              <WellItem key={d.id}>{d.display_name}</WellItem>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
