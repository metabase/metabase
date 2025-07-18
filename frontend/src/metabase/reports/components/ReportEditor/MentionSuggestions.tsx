import { t } from "ttag";
import { useEffect, useState } from "react";
import { Paper, Text, Badge, Group, Box } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

interface MentionSuggestionsProps {
  items: SearchResult[];
  command: ((item: SearchResult) => void) | null;
  clientRect: DOMRect | null;
}

export const MentionSuggestions = ({
  items,
  command,
  clientRect
}: MentionSuggestionsProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item && command) {
          command(item);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        // Close suggestions
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [items, selectedIndex, command]);

  if (items.length === 0 || !clientRect) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: `${clientRect.left}px`,
        top: `${clientRect.top + clientRect.height}px`,
        zIndex: 1000,
        minWidth: "300px",
      }}
    >
      <Paper shadow="md" p="xs" style={{ maxHeight: "200px", overflow: "auto" }}>
        {items.map((item, index) => (
          <Box
            key={`${item.id}__${item.model}`}
            p="xs"
            style={{
              backgroundColor: index === selectedIndex ? "var(--mb-color-brand)" : "transparent",
              color: index === selectedIndex ? "white" : "inherit",
              cursor: "pointer",
              borderRadius: "4px",
            }}
            onClick={() => command?.(item)}
          >
            <Group justify="space-between" align="center">
              <Box>
                <Text size="sm" fw={500}>
                  {item.name}
                </Text>
                <Text size="xs" c={index === selectedIndex ? "white" : "dimmed"}>
                  {item.model} • {item.database_name || t`No database`}
                </Text>
              </Box>
              <Badge size="xs" variant="light">
                {item.model}
              </Badge>
            </Group>
          </Box>
        ))}
      </Paper>
    </div>
  );
};
