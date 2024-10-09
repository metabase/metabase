import { Box, Text } from "metabase/ui";

export interface ResultsItem {
  id: number | string;
  name: string;
}

export interface ResultsListProps {
  items: ResultsItem[];
  onSelect?: (item: ResultsItem) => void;
}

export const ResultsList = ({ items, onSelect }: ResultsListProps) => {
  return (
    <Box component="ul">
      {items.map(item => (
        <Box
          style={{
            border: "1px solid var(--mb-color-border)",
            borderRadius: 5,
            cursor: "pointer",
          }}
          key={item.id}
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
