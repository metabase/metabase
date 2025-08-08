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

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { Box, Group, type IconName, Loader, Text } from "metabase/ui";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import styles from "../../Editor.module.css";
import type { MenuItem } from "../../shared/MenuComponents";
import {
  MenuItemComponent,
  MetabotFooter,
  SearchResultsFooter,
} from "../../shared/MenuComponents";
import {
  buildRecentsMenuItems,
  buildSearchMenuItems,
  isRecentQuestion,
} from "../shared/suggestionUtils";

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

interface MentionItem {
  icon: IconName;
  iconColor?: string;
  label: string;
  description?: string;
  action: () => void;
  id: number | string;
  type?: string;
}

const MODELS_TO_SEARCH: SearchModel[] = ["card", "dataset"];

const MentionSuggestionComponent = forwardRef<
  SuggestionRef,
  MentionSuggestionProps
>(function MentionSuggestionComponent(
  { items: _items, command, editor, range: _range, query },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<"question-picker" | null>(null);

  const { data: recents = [], isLoading: isRecentsLoading } =
    useListRecentsQuery(undefined, { refetchOnMountOrArgChange: true });

  const filteredRecents = recents.filter(isRecentQuestion).slice(0, 4);

  // Search functionality
  const { data: searchResponse, isLoading: isSearchLoading } = useSearchQuery(
    {
      q: query,
      models: MODELS_TO_SEARCH,
      limit: 4,
    },
    {
      skip: !query || query.length === 0,
    },
  );

  const searchResults = useMemo(
    () => (searchResponse?.data as SearchResult[]) ?? [],
    [searchResponse],
  );

  const handleRecentSelect = useCallback(
    (item: RecentItem) => {
      command({
        id: item.id,
        model: item.model,
      });
    },
    [command],
  );

  const handleSearchResultSelect = useCallback(
    (item: SearchResult) => {
      command({
        id: item.id,
        model: item.model,
      });
    },
    [command],
  );

  const insertMetabotBlock = () => {
    command({
      type: "metabot",
    });
  };

  const menuItems = useMemo(() => {
    const items: Array<MentionItem | MenuItem> = [];

    if (query.length > 0) {
      if (!isSearchLoading && searchResults.length > 0) {
        items.push(
          ...buildSearchMenuItems(searchResults, handleSearchResultSelect),
        );
      }
    } else {
      if (!isRecentsLoading && filteredRecents.length > 0) {
        items.push(
          ...buildRecentsMenuItems(filteredRecents, handleRecentSelect),
        );
      }
    }

    return items as MentionItem[];
  }, [
    query,
    searchResults,
    isSearchLoading,
    filteredRecents,
    isRecentsLoading,
    handleRecentSelect,
    handleSearchResultSelect,
  ]);

  const totalItems = menuItems.length + 2;

  const selectItem = (index: number) => {
    if (index < menuItems.length) {
      menuItems[index].action();
    } else if (index === menuItems.length) {
      setModal("question-picker");
    } else {
      insertMetabotBlock();
    }
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

  const handleModalSelect = (item: QuestionPickerValueItem) => {
    command({
      id: item.id,
      model: item.model,
    });
    setModal(null);
  };

  const handleModalClose = () => {
    setModal(null);
    setTimeout(() => {
      editor.commands.focus();
    }, 0);
  };

  return (
    <Box
      className={styles.suggestionPopup}
      role="dialog"
      aria-label={t`Mention Dialog`}
    >
      <Box
        className={styles.suggestionScroll}
        role="list"
        aria-label={t`Suggestions`}
      >
        {(isRecentsLoading && query.length === 0) ||
        (isSearchLoading && query.length > 0) ? (
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
              />
            ))}
            {query.length > 0 &&
            searchResults.length === 0 &&
            !isSearchLoading ? (
              <Box p="sm">
                <Text size="md" c="text-medium" ta="center">
                  {t`No results found`}
                </Text>
              </Box>
            ) : null}
            <SearchResultsFooter
              isSelected={selectedIndex === menuItems.length}
              onClick={() => setModal("question-picker")}
            />
            <MetabotFooter
              isSelected={selectedIndex === menuItems.length + 1}
              onClick={insertMetabotBlock}
            />
          </>
        )}
      </Box>

      {modal === "question-picker" && (
        <QuestionPickerModal
          onChange={handleModalSelect}
          onClose={handleModalClose}
        />
      )}
    </Box>
  );
});

export const MentionSuggestion = MentionSuggestionComponent;
