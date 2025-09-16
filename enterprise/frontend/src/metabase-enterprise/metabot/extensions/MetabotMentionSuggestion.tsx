import type { Editor, Range } from "@tiptap/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { t } from "ttag";

import { Box, Flex, Paper, Text } from "metabase/ui";

import type { MetabotMentionCommandProps } from "./MetabotMentionExtension";

interface MetabotMentionSuggestionProps {
  items: any[];
  command: (props: MetabotMentionCommandProps) => void;
  editor: Editor;
  range: Range;
  query: string;
}

interface SuggestionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// Mock items for testing @ trigger functionality
const MOCK_ENTITIES = [
  { id: 1, model: "table", label: "Orders" },
  { id: 2, model: "table", label: "Products" },
  { id: 3, model: "table", label: "Customers" },
  { id: 4, model: "dashboard", label: "Sales Dashboard" },
  { id: 5, model: "document", label: "Q4 Report" },
];

export const MetabotMentionSuggestion = forwardRef<
  SuggestionRef,
  MetabotMentionSuggestionProps
>(function MetabotMentionSuggestion({ command, query }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter mock items based on query
  const filteredItems = MOCK_ENTITIES.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 5); // Limit to 5 items for now

  // Reset selectedIndex when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length, query]);

  const selectItem = useCallback(
    (item: (typeof MOCK_ENTITIES)[0]) => {
      command({
        id: item.id,
        model: item.model,
        label: item.label,
      });
    },
    [command],
  );

  // Handle keyboard navigation
  const onKeyDown = useCallback(
    ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex(
          (index) => (index - 1 + filteredItems.length) % filteredItems.length,
        );
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((index) => (index + 1) % filteredItems.length);
        return true;
      }

      if (event.key === "Enter") {
        const item = filteredItems[selectedIndex];
        if (item) {
          selectItem(item);
        }
        return true;
      }

      if (event.key === "Escape") {
        return true;
      }

      return false;
    },
    [filteredItems, selectedIndex, selectItem],
  );

  useImperativeHandle(ref, () => ({
    onKeyDown,
  }));

  if (filteredItems.length === 0) {
    return (
      <Paper
        shadow="md"
        radius="sm"
        style={{
          minWidth: 200,
          maxWidth: 320,
        }}
      >
        <Box p="md">
          <Text c="text-light" size="sm">
            {query ? t`No results found for "${query}"` : t`No items found`}
          </Text>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      shadow="md"
      radius="sm"
      style={{
        minWidth: 200,
        maxWidth: 320,
      }}
    >
      <Box p="xs">
        {filteredItems.map((item, index) => (
          <Box
            key={`${item.model}-${item.id}`}
            p="xs"
            style={{
              cursor: "pointer",
              borderRadius: "0.25rem",
              backgroundColor:
                index === selectedIndex
                  ? "var(--mb-color-background-hover)"
                  : "transparent",
            }}
            onClick={() => selectItem(item)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <Flex align="center" gap="xs">
              <Text size="sm" fw={500}>
                {item.label}
              </Text>
              <Text size="xs" c="text-light">
                ({item.model})
              </Text>
            </Flex>
          </Box>
        ))}
      </Box>
    </Paper>
  );
});
