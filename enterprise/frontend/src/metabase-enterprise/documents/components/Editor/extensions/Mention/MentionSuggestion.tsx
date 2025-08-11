import type { Editor, Range } from "@tiptap/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { Box, Divider, Text } from "metabase/ui";
import type { RecentItem, SearchResult } from "metabase-types/api";

import {
  MenuItemComponent,
  SearchResultsFooter,
} from "../../shared/MenuComponents";
import {
  LoadingSuggestionPaper,
  SuggestionPaper,
} from "../../shared/SuggestionPaper";
import { useEntitySearch } from "../shared/useEntitySearch";

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

const MentionSuggestionComponent = forwardRef<
  SuggestionRef,
  MentionSuggestionProps
>(function MentionSuggestionComponent(
  { items: _items, command, editor, range: _range, query },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<"question-picker" | null>(null);

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

  const { menuItems, isLoading, searchResults } = useEntitySearch({
    query,
    onSelectRecent: handleRecentSelect,
    onSelectSearchResult: handleSearchResultSelect,
  });

  const totalItems = menuItems.length + 1;

  const selectItem = (index: number) => {
    if (index < menuItems.length) {
      menuItems[index].action();
    } else {
      setModal("question-picker");
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

  if (isLoading) {
    return <LoadingSuggestionPaper aria-label={t`Mention Dialog`} />;
  }

  return (
    <SuggestionPaper aria-label={t`Mention Dialog`}>
      <>
        {menuItems.map((item, index) => (
          <MenuItemComponent
            key={index}
            item={item}
            isSelected={selectedIndex === index}
            onClick={() => selectItem(index)}
          />
        ))}
        {query.length > 0 && searchResults.length === 0 ? (
          <Box p="sm" ta="center">
            <Text size="sm" c="dimmed">{t`No results found`}</Text>
          </Box>
        ) : null}
        <Divider my="sm" mx="sm" />
        <SearchResultsFooter
          isSelected={selectedIndex === menuItems.length}
          onClick={() => setModal("question-picker")}
        />
      </>

      {modal === "question-picker" && (
        <QuestionPickerModal
          onChange={handleModalSelect}
          onClose={handleModalClose}
        />
      )}
    </SuggestionPaper>
  );
});

export const MentionSuggestion = MentionSuggestionComponent;
