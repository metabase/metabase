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
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import { MenuItemComponent } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import {
  LoadingSuggestionPaper,
  SuggestionPaper,
} from "metabase-enterprise/documents/components/Editor/shared/SuggestionPaper";
import type { RecentItem, SearchModel } from "metabase-types/api";

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

  // Convert items to MenuItem format
  const menuItems = useMemo(() => {
    return items.map((item): MenuItem => {
      const iconData = getIcon({
        model: item.model,
        display: (item as any).display,
      });
      const itemName = "name" in item ? item.name : item.item_name;
      const itemId = "id" in item ? item.id : item.item_id;
      const collectionName = item.collection?.name;

      return {
        icon: iconData.name,
        iconColor: iconData.color,
        label: itemName,
        description: collectionName,
        model: item.model as any,
        id: itemId,
        action: () => {
          command({
            id: itemId,
            model: item.model,
            label: itemName,
          });
        },
      };
    });
  }, [items, command]);

  const selectItem = useCallback(
    (index: number) => {
      const menuItem = menuItems[index];
      if (menuItem) {
        menuItem.action();
      }
    },
    [menuItems],
  );

  // Handle keyboard navigation
  const onKeyDown = useCallback(
    ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((index) =>
          index > 0 ? index - 1 : menuItems.length - 1,
        );
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((index) =>
          index < menuItems.length - 1 ? index + 1 : 0,
        );
        return true;
      }

      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }

      if (event.key === "Escape") {
        return true;
      }

      return false;
    },
    [menuItems.length, selectedIndex, selectItem],
  );

  useImperativeHandle(ref, () => ({
    onKeyDown,
  }));

  const isLoading =
    query.length > 0
      ? isSearchLoading || query !== debouncedQuery
      : isRecentsLoading;

  if (isLoading) {
    return <LoadingSuggestionPaper aria-label={t`Metabot Mention Dialog`} />;
  }

  if (menuItems.length === 0) {
    return (
      <SuggestionPaper aria-label={t`Metabot Mention Dialog`}>
        <MenuItemComponent
          item={{
            icon: "info",
            label: query
              ? t`No results found for "${query}"`
              : t`No recent items`,
            action: () => {},
          }}
          isSelected={false}
        />
      </SuggestionPaper>
    );
  }

  return (
    <SuggestionPaper aria-label={t`Metabot Mention Dialog`}>
      {menuItems.map((item, index) => (
        <MenuItemComponent
          key={`${item.model}-${item.id}`}
          item={item}
          isSelected={selectedIndex === index}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        />
      ))}
    </SuggestionPaper>
  );
});
