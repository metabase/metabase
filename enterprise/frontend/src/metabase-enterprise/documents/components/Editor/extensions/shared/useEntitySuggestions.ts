import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useState } from "react";

import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import { useEntitySearch } from "./useEntitySearch";

interface UseEntitySuggestionsOptions {
  query: string;
  editor: Editor;
  onSelectEntity: (item: { id: number | string; model: string }) => void;
  enabled?: boolean;
  searchModels?: SearchModel[];
}

interface UseEntitySuggestionsResult {
  menuItems: ReturnType<typeof useEntitySearch>["menuItems"];
  isLoading: boolean;
  searchResults: SearchResult[];
  selectedIndex: number;
  modal: "question-picker" | null;
  totalItems: number;
  handlers: {
    selectItem: (index: number) => void;
    upHandler: () => void;
    downHandler: () => void;
    enterHandler: () => void;
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
    handleModalSelect: (item: QuestionPickerValueItem) => void;
    handleModalClose: () => void;
    openModal: () => void;
    hoverHandler: (index: number) => void;
  };
}

export function useEntitySuggestions({
  query,
  editor,
  onSelectEntity,
  enabled = true,
  searchModels,
}: UseEntitySuggestionsOptions): UseEntitySuggestionsResult {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<"question-picker" | null>(null);

  const handleRecentSelect = useCallback(
    (item: RecentItem) => {
      onSelectEntity({
        id: item.id,
        model: item.model,
      });
    },
    [onSelectEntity],
  );

  const handleSearchResultSelect = useCallback(
    (item: SearchResult) => {
      onSelectEntity({
        id: item.id,
        model: item.model,
      });
    },
    [onSelectEntity],
  );

  const { menuItems, isLoading, searchResults } = useEntitySearch({
    query,
    onSelectRecent: handleRecentSelect,
    onSelectSearchResult: handleSearchResultSelect,
    enabled,
    searchModels,
  });

  const totalItems = menuItems.length + 1;

  const selectItem = useCallback(
    (index: number) => {
      if (index < menuItems.length) {
        menuItems[index].action();
      } else {
        setModal("question-picker");
      }
    },
    [menuItems],
  );

  const upHandler = useCallback(() => {
    setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
  }, [totalItems]);

  const downHandler = useCallback(() => {
    setSelectedIndex((prev) => (prev + 1) % totalItems);
  }, [totalItems]);

  const enterHandler = useCallback(() => {
    selectItem(selectedIndex);
  }, [selectItem, selectedIndex]);

  const hoverHandler = useCallback(
    (index: number) => setSelectedIndex(index),
    [],
  );

  const onKeyDown = useCallback(
    ({ event }: { event: KeyboardEvent }) => {
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
    [upHandler, downHandler, enterHandler],
  );

  const handleModalSelect = useCallback(
    (item: QuestionPickerValueItem) => {
      onSelectEntity({
        id: item.id,
        model: item.model,
      });
      setModal(null);
    },
    [onSelectEntity],
  );

  const handleModalClose = useCallback(() => {
    setModal(null);
    setTimeout(() => {
      editor.commands.focus();
    }, 0);
  }, [editor]);

  const openModal = useCallback(() => {
    setModal("question-picker");
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [menuItems.length]);

  return {
    menuItems,
    isLoading,
    searchResults,
    selectedIndex,
    modal,
    totalItems,
    handlers: {
      selectItem,
      upHandler,
      downHandler,
      enterHandler,
      onKeyDown,
      handleModalSelect,
      handleModalClose,
      openModal,
      hoverHandler,
    },
  };
}
