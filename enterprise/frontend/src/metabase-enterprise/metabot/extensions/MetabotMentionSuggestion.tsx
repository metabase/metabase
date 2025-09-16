import type { Editor, Range } from "@tiptap/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { getIcon } from "metabase/lib/icon";
import { Box, Flex, Icon, Paper, Text } from "metabase/ui";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

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

// Search models to include in @ mentions
const METABOT_SEARCH_MODELS: SearchModel[] = [
  "card",
  "dataset",
  "metric",
  "dashboard",
  "database",
  "table",
  "collection",
  "document",
];

const SUGGESTION_LIMIT = 8;

export const MetabotMentionSuggestion = forwardRef<
  SuggestionRef,
  MetabotMentionSuggestionProps
>(function MetabotMentionSuggestion({ command, query }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the search query to avoid excessive API calls
  useDebounce(
    () => {
      setDebouncedQuery(query);
    },
    SEARCH_DEBOUNCE_DURATION,
    [query],
  );

  // Search for entities when user types after @
  const { data: searchResponse, isLoading: isSearchLoading } = useSearchQuery(
    {
      q: debouncedQuery,
      models: METABOT_SEARCH_MODELS,
      limit: SUGGESTION_LIMIT,
    },
    {
      skip: !debouncedQuery || debouncedQuery.length === 0,
    },
  );

  // Show recent items when just @ is typed
  const { data: recents = [], isLoading: isRecentsLoading } =
    useListRecentsQuery(undefined, {
      skip: query.length > 0,
    });

  // Filter and prepare items for display
  const items = useMemo(() => {
    if (query.length > 0) {
      // Show search results if we have a query (even while debouncing)
      return searchResponse?.data ?? [];
    }

    // Filter recents to only include searchable models and limit
    return recents
      .filter((recent: RecentItem) =>
        METABOT_SEARCH_MODELS.includes(recent.model as SearchModel),
      )
      .slice(0, SUGGESTION_LIMIT);
  }, [query, searchResponse, recents]);

  // Reset selectedIndex when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length, query]);

  const selectItem = useCallback(
    (item: SearchResult | RecentItem) => {
      command({
        id: "id" in item ? item.id : item.item_id,
        model: "model" in item ? item.model : item.model,
        label: "name" in item ? item.name : item.item_name,
      });
    },
    [command],
  );

  // Handle keyboard navigation
  const onKeyDown = useCallback(
    ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((index) => (index - 1 + items.length) % items.length);
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((index) => (index + 1) % items.length);
        return true;
      }

      if (event.key === "Enter") {
        const item = items[selectedIndex];
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
    [items, selectedIndex, selectItem],
  );

  useImperativeHandle(ref, () => ({
    onKeyDown,
  }));

  const isLoading =
    query.length > 0
      ? isSearchLoading || query !== debouncedQuery
      : isRecentsLoading;

  if (isLoading) {
    return (
      <Paper
        shadow="md"
        radius="sm"
        style={{
          minWidth: 200,
          maxWidth: 320,
        }}
      >
        <Flex align="center" justify="center" p="md">
          <Icon name="hourglass" size="1rem" />
          <Text ml="xs">{t`Loading...`}</Text>
        </Flex>
      </Paper>
    );
  }

  if (items.length === 0) {
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
            {query ? t`No results found for "${query}"` : t`No recent items`}
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
        {items.map((item, index) => {
          const iconData = getIcon({
            model: item.model,
            display: (item as any).display,
          });
          const itemName = "name" in item ? item.name : item.item_name;
          const itemId = "id" in item ? item.id : item.item_id;

          return (
            <Box
              key={`${item.model}-${itemId}`}
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
                <Icon name={iconData.name} c={iconData.color} size="1rem" />
                <Text size="sm" truncate fw={500}>
                  {itemName}
                </Text>
              </Flex>
              {item.collection && (
                <Text size="xs" c="text-light" truncate ml="1.5rem">
                  {item.collection.name}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
});
