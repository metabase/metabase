import type { Editor, Range } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { modelToUrl } from "metabase/lib/urls/modelToUrl";
import type {
  MentionableUser,
  RecentItem,
  SearchResult,
} from "metabase-types/api";

import {
  buildSearchModelMenuItems,
  entityToUrlableModel,
} from "./suggestionUtils";
import type { SuggestionModel } from "./types";
import { useEntitySearch } from "./useEntitySearch";

interface UseEntitySuggestionsOptions {
  query: string;
  editor: Editor;
  range?: Range;
  onSelectEntity: (item: {
    id: number | string;
    model: string;
    label?: string;
    href: string | null;
  }) => void;
  enabled?: boolean;
  searchModels?: SuggestionModel[];
  canBrowseAll: boolean;
}

interface UseEntitySuggestionsResult {
  menuItems: ReturnType<typeof useEntitySearch>["menuItems"];
  isLoading: boolean;
  searchResults: SearchResult[];
  selectedIndex: number;
  modal: "question-picker" | null;
  totalItems: number;
  selectedSearchModelName?: string;
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
  range,
  onSelectEntity,
  enabled = true,
  searchModels,
  canBrowseAll,
}: UseEntitySuggestionsOptions): UseEntitySuggestionsResult {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<"question-picker" | null>(null);
  const [selectedSearchModel, setSelectedSearchModel] =
    useState<SuggestionModel | null>(null);

  const handleRecentSelect = useCallback(
    (item: RecentItem) => {
      onSelectEntity({
        id: item.id,
        model: item.model,
        label: "display_name" in item ? item.display_name : item.name,
        href: modelToUrl(entityToUrlableModel(item, item.model)),
      });
    },
    [onSelectEntity],
  );

  const handleSearchResultSelect = useCallback(
    (item: SearchResult) => {
      onSelectEntity({
        id: item.id,
        model: item.model,
        label: item.name,
        href: modelToUrl(entityToUrlableModel(item, item.model)),
      });
    },
    [onSelectEntity],
  );

  const handleUserSelect = useCallback(
    (item: MentionableUser) => {
      onSelectEntity({
        id: item.id,
        model: "user",
        label: item.common_name,
        href: modelToUrl(entityToUrlableModel(item, "user")),
      });
    },
    [onSelectEntity],
  );

  const handleSearchModelSelect = useCallback(
    (model: SuggestionModel) => {
      // clear any input the user made to filter search models
      if (range) {
        editor.chain().focus().deleteRange(range).insertContent("@").run();
      }
      setSelectedSearchModel(model);
      setSelectedIndex(0);
    },
    [editor, range],
  );

  const filteredSearchModels = useMemo(() => {
    if (!searchModels) {
      return undefined;
    }
    return searchModels.filter((model) => {
      const modelName = getTranslatedEntityName(model) ?? "";
      return modelName.toLowerCase().startsWith(query.toLowerCase());
    });
  }, [searchModels, query]);

  // Use selected model if available, otherwise use all models for fallback search
  const effectiveSearchModels = useMemo(() => {
    return selectedSearchModel ? [selectedSearchModel] : filteredSearchModels;
  }, [selectedSearchModel, filteredSearchModels]);

  // Determine if we're in model selection mode
  const searchModelMenuItems = useMemo(() => {
    return selectedSearchModel || filteredSearchModels === undefined
      ? []
      : buildSearchModelMenuItems(
          filteredSearchModels,
          handleSearchModelSelect,
        );
  }, [filteredSearchModels, selectedSearchModel, handleSearchModelSelect]);

  // Check if we have any matching search models
  const hasSearchModels = (searchModels?.length ?? 0) > 0;
  const hasMatchingSearchModels = (effectiveSearchModels?.length ?? 0) > 0;
  const isInModelSelectionMode =
    !selectedSearchModel && hasSearchModels && hasMatchingSearchModels;

  const {
    menuItems: entityMenuItems,
    isLoading,
    searchResults,
  } = useEntitySearch({
    query,
    onSelectRecent: handleRecentSelect,
    onSelectSearchResult: handleSearchResultSelect,
    onSelectUser: handleUserSelect,
    enabled: enabled && !isInModelSelectionMode,
    shouldFetchRecents:
      enabled &&
      query.length === 0 &&
      !isInModelSelectionMode &&
      !selectedSearchModel,
    searchModels: effectiveSearchModels,
  });

  // Combine menu items based on current mode
  const menuItems = useMemo(() => {
    if (isInModelSelectionMode) {
      return searchModelMenuItems;
    }
    return entityMenuItems;
  }, [isInModelSelectionMode, searchModelMenuItems, entityMenuItems]);

  const totalItems = menuItems.length + Number(canBrowseAll);

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
        event.stopPropagation();
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
        label: item.name,
        href: modelToUrl(entityToUrlableModel(item, item.model)),
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

  // Get the translated name for the selected search model
  const selectedSearchModelName = selectedSearchModel
    ? getTranslatedEntityName(selectedSearchModel) || selectedSearchModel
    : undefined;

  return {
    menuItems,
    isLoading: isInModelSelectionMode ? false : isLoading,
    searchResults,
    selectedIndex,
    modal,
    totalItems,
    selectedSearchModelName,
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
