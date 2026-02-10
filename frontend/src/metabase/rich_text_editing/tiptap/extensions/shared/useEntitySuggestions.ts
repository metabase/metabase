import type { Editor, Range } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { modelToUrl } from "metabase/lib/urls/modelToUrl";
import type { DocumentLinkedEntityPickerItemValue } from "metabase/rich_text_editing/tiptap/extensions/shared/LinkedEntityPickerModal/types";
import type {
  MentionableUser,
  RecentItem,
  SearchResult,
} from "metabase-types/api";

import {
  buildSearchModelMenuItems,
  entityToUrlableModel,
  getBrowseAllItemIndex,
} from "./suggestionUtils";
import type { SuggestionModel, SuggestionPickerModalType } from "./types";
import { type EntitySearchOptions, useEntitySearch } from "./useEntitySearch";

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
  searchOptions?: EntitySearchOptions;
  canFilterSearchModels: boolean;
  canBrowseAll: boolean;
  canCreateNewQuestion?: boolean;
  onTriggerCreateNewQuestion?: () => void;
}

interface UseEntitySuggestionsResult {
  menuItems: ReturnType<typeof useEntitySearch>["menuItems"];
  isLoading: boolean;
  searchResults: SearchResult[];
  selectedIndex: number;
  modal: SuggestionPickerModalType;
  totalItems: number;
  selectedSearchModelName?: string;
  handlers: {
    selectItem: (index: number) => void;
    upHandler: () => void;
    downHandler: () => void;
    enterHandler: () => void;
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
    handleModalSelect: (item: DocumentLinkedEntityPickerItemValue) => void;
    handleModalClose: () => void;
    openModal: () => void;
    hoverHandler: (index: number) => void;
    onSaveNewQuestion: (id: number, name: string) => void;
  };
}

export function useEntitySuggestions({
  query,
  editor,
  range,
  onSelectEntity,
  enabled = true,
  searchModels,
  searchOptions,
  canFilterSearchModels,
  canBrowseAll = false,
  canCreateNewQuestion = false,
  onTriggerCreateNewQuestion,
}: UseEntitySuggestionsOptions): UseEntitySuggestionsResult {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<SuggestionPickerModalType>(null);
  const [selectedSearchModel, setSelectedSearchModel] =
    useState<SuggestionModel | null>(
      searchModels?.length === 1 ? searchModels[0] : null,
    );

  // sync selectedSearchModel when searchModels changes
  useEffect(() => {
    if (searchModels?.length === 1) {
      setSelectedSearchModel(searchModels[0]);
    } else if (
      selectedSearchModel &&
      !searchModels?.includes(selectedSearchModel)
    ) {
      // Reset if current selection is no longer valid
      setSelectedSearchModel(null);
    }
  }, [searchModels, selectedSearchModel]);

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
    if (!searchModels || !canFilterSearchModels) {
      return undefined;
    }
    return searchModels.filter((model) => {
      const modelName = getTranslatedEntityName(model) ?? "";
      return modelName.toLowerCase().startsWith(query.toLowerCase());
    });
  }, [searchModels, query, canFilterSearchModels]);

  // Use selected model if available, otherwise use filtered models
  // If no models match the filter but searchModels was provided, fall back to all searchModels
  const effectiveSearchModels = useMemo(() => {
    if (selectedSearchModel) {
      return [selectedSearchModel];
    }
    if (
      searchModels &&
      (!filteredSearchModels || filteredSearchModels?.length === 0)
    ) {
      return searchModels;
    }
    return filteredSearchModels;
  }, [selectedSearchModel, filteredSearchModels, searchModels]);

  const searchModelMenuItems = useMemo(() => {
    return selectedSearchModel || filteredSearchModels === undefined
      ? []
      : buildSearchModelMenuItems(
          filteredSearchModels,
          handleSearchModelSelect,
        );
  }, [filteredSearchModels, selectedSearchModel, handleSearchModelSelect]);

  const hasSearchModels = (searchModels?.length ?? 0) > 0;
  const hasMatchingFilteredModels = (filteredSearchModels?.length ?? 0) > 0;
  const isInModelSelectionMode =
    !selectedSearchModel &&
    hasSearchModels &&
    hasMatchingFilteredModels &&
    (searchModels?.length ?? 0) > 1;

  const shouldFetchRecents =
    enabled &&
    query.length === 0 &&
    !isInModelSelectionMode &&
    !selectedSearchModel;

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
    shouldFetchRecents,
    searchModels: effectiveSearchModels,
    searchOptions,
  });

  const menuItems = useMemo(() => {
    if (isInModelSelectionMode) {
      return searchModelMenuItems;
    }
    return entityMenuItems;
  }, [isInModelSelectionMode, searchModelMenuItems, entityMenuItems]);

  const totalItems =
    menuItems.length + Number(canBrowseAll) + Number(canCreateNewQuestion);

  const selectItem = useCallback(
    (index: number) => {
      if (index < menuItems.length) {
        menuItems[index].action();
        return;
      }

      if (index === menuItems.length && canCreateNewQuestion) {
        onTriggerCreateNewQuestion?.();
        return;
      }

      const browseAllItemIndex = getBrowseAllItemIndex(
        menuItems.length,
        canCreateNewQuestion,
      );

      if (index === browseAllItemIndex) {
        setModal("question-picker");
      }
    },
    [canCreateNewQuestion, menuItems, onTriggerCreateNewQuestion],
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
      if (
        event.key === "ArrowUp" ||
        (event.key === "p" && (event.metaKey || event.ctrlKey))
      ) {
        upHandler();
        return true;
      }

      if (
        event.key === "ArrowDown" ||
        (event.key === "n" && (event.metaKey || event.ctrlKey))
      ) {
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
    (item: OmniPickerItem) => {
      if (item.model === "snippet" || item.model === "schema") {
        console.error(`Cannot select ${item.model}`);
        return;
      }
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

  const onSaveNewQuestion = (id: number, name: string) => {
    onSelectEntity({
      id: id,
      model: "card",
      label: name,
      href: modelToUrl(entityToUrlableModel({ id, name }, "card")),
    });
  };

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
      onSaveNewQuestion,
    },
  };
}
