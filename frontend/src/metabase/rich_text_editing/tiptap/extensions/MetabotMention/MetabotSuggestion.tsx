import type { Editor, Range } from "@tiptap/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import type {
  Item,
  Section,
} from "metabase/common/components/AccordionList/types";
import { searchFilter } from "metabase/common/components/AccordionList/utils";
import type { MenuItem } from "metabase/documents/components/Editor/shared/MenuComponents";
import { MenuItemComponent } from "metabase/documents/components/Editor/shared/MenuComponents";
import { SuggestionPaper } from "metabase/documents/components/Editor/shared/SuggestionPaper";
import { Box, Group, Loader, Text } from "metabase/ui";
import type { Database, SearchResult } from "metabase-types/api";

import { buildDbMenuItems } from "../shared/suggestionUtils";

interface MentionSuggestionProps {
  items: SearchResult[];
  command: (item: MentionCommandItem) => void;
  editor: Editor;
  range: Range;
  query: string;
}

interface MentionCommandItem {
  type?: string;
  id?: number | string;
  model?: string;
}

interface SuggestionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MetabotMentionSuggestionComponent = forwardRef<
  SuggestionRef,
  MentionSuggestionProps
>(function MetabotMentionSuggestionComponent(
  { items: _items, command, range: _range, query },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { data: dbsResponse, isLoading } = useListDatabasesQuery();

  const handleDbSelect = useCallback(
    (item: Database) => {
      command({
        id: item.id,
        model: "database",
      });
    },
    [command],
  );

  const menuItems = useMemo(() => {
    const items: MenuItem[] = [];

    if (dbsResponse?.data) {
      const sections: Section<Item & { database: Database }>[] = [];

      sections.push({
        items: dbsResponse.data.map((database, index) => ({
          name: database.name,
          index,
          database,
        })),
      });

      const sorted = searchFilter<
        Item & { database: Database },
        (typeof sections)[number]
      >({
        sections,
        searchText: query,
      })[0];
      const dbs = sorted?.items?.map((item) => item.item.database) || [];
      items.push(...buildDbMenuItems(dbs, handleDbSelect));
    }

    return items;
  }, [dbsResponse?.data, handleDbSelect, query]);

  const totalItems = menuItems.length;

  const selectItem = (index: number) => {
    menuItems[index]?.action?.();
  };

  const upHandler = () => {
    setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
  };

  const downHandler = () => {
    setSelectedIndex((prev) => (prev + 1) % totalItems);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [menuItems.length]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter") {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  return (
    <SuggestionPaper aria-label={t`Metabot dialog`}>
      {isLoading ? (
        <Group justify="center" p="sm">
          <Loader size="sm" />
        </Group>
      ) : (
        <>
          {menuItems.map((item, index) => (
            <MenuItemComponent
              key={index}
              item={item}
              isSelected={selectedIndex === index}
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
            />
          ))}
          {query.length > 0 && totalItems === 0 && !isLoading ? (
            <Box p="sm">
              <Text size="md" c="text-secondary" ta="center">
                {t`No results found`}
              </Text>
            </Box>
          ) : null}
        </>
      )}
    </SuggestionPaper>
  );
});

export const MetabotMentionSuggestion = MetabotMentionSuggestionComponent;
