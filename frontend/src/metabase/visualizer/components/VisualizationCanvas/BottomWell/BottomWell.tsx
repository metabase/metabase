import { Box, type BoxProps, Group, type GroupProps, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { VisualizationDisplay } from "metabase-types/api";

interface BottomWellProps extends GroupProps {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
}

export function BottomWell({
  display,
  settings,
  style,
  ...props
}: BottomWellProps) {
  if (display !== "funnel") {
    return null;
  }

  const rows = settings?.["funnel.rows"] ?? [];

  return (
    <Group
      {...props}
      bg="var(--mb-color-text-light)"
      p="sm"
      noWrap
      spacing="md"
      style={{
        ...style,
        overflowX: "auto",
        overflowY: "hidden",
        borderRadius: 16,
      }}
    >
      <WellItem>
        <Text color="text-white">{settings["funnel.dimension"]}</Text>
      </WellItem>
      {rows.map(row => (
        <WellItem key={row.key} isDraggable>
          <Text>{row.name}</Text>
        </WellItem>
      ))}
    </Group>
  );
}

interface WellItemProps extends BoxProps {
  isDraggable?: boolean;
}

function WellItem({ isDraggable = false, ...props }: WellItemProps) {
  return (
    <Box
      {...props}
      bg={isDraggable ? "var(--mb-color-bg-white)" : "transparent"}
      px="sm"
      style={{ borderRadius: 16 }}
    />
  );
}
