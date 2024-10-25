import { Box, Text } from "metabase/ui";
import type { CardId } from "metabase-types/api";

export interface ResultsItem {
  id: number | string;
  name: string;
}

export interface ResultsListProps {
  items: ResultsItem[];
  onSelect?: (item: ResultsItem) => void;
  selectedCardIds: Set<CardId>;
}

export const ResultsList = ({
  items,
  onSelect,
  selectedCardIds,
}: ResultsListProps) => {
  return (
    <Box component="ul">
      {items.map((item, index) => (
        <Box
          style={{
            border: "1px solid var(--mb-color-border)",
            borderRadius: 5,
            cursor: "pointer",
            backgroundColor:
              typeof item.id === "number" && selectedCardIds.has(item.id)
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
