import { Box, Text } from "metabase/ui";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

export interface ResultsListProps {
  items: VisualizerDataSource[];
  onSelect?: (item: VisualizerDataSource) => void;
  dataSourceIds: Set<VisualizerDataSourceId>;
}

export const ResultsList = ({
  items,
  onSelect,
  dataSourceIds,
}: ResultsListProps) => {
  return (
    <Box component="ul">
      {items.map((item, index) => (
        <Box
          style={{
            border: "1px solid var(--mb-color-border)",
            borderRadius: 5,
            cursor: "pointer",
            backgroundColor: dataSourceIds.has(item.id)
              ? "var(--mb-color-bg-light)"
              : "transparent",
          }}
          key={index}
          component="li"
          px={14}
          py={10}
          mb={4}
          onClick={() => onSelect?.(item)}
        >
          <Text truncate>{item.name}</Text>
        </Box>
      ))}
    </Box>
  );
};
