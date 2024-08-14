import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import type { EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import type {
  CollectionPickerItem,
  CollectionPickerOptions,
  CollectionPickerValueItem,
} from "../types";

import { CollectionPicker } from "./CollectionPicker";
import { NewCollectionDialog } from "./NewCollectionDialog";

export interface CollectionPickerModalProps {
  title?: string;
  onChange: (item: CollectionPickerValueItem) => void;
  onClose: () => void;
  options?: CollectionPickerOptions;
  value: Pick<CollectionPickerValueItem, "id" | "model">;
  shouldDisableItem?: (item: CollectionPickerItem) => boolean;
  searchResultFilter?: (searchResults: SearchResult[]) => SearchResult[];
  recentFilter?: (recentItems: RecentItem[]) => RecentItem[];
}

const canSelectItem = (
  item: Pick<CollectionPickerItem, "can_write" | "model"> | null,
): item is CollectionPickerValueItem => {
  return !!item && item.can_write !== false && item.model === "collection";
};

const searchFilter = (searchResults: SearchResult[]): SearchResult[] => {
  return searchResults.filter(result => result.can_write);
};

export const CollectionPickerModal = ({
  title = t`Choose a collection`,
  onChange,
  onClose,
  value,
  options = defaultOptions,
  shouldDisableItem,
  searchResultFilter,
  recentFilter,
}: CollectionPickerModalProps) => {
  options = { ...defaultOptions, ...options };
  const [selectedItem, setSelectedItem] = useState<CollectionPickerItem | null>(
    null,
  );

  const [
    isCreateDialogOpen,
    { turnOn: openCreateDialog, turnOff: closeCreateDialog },
  ] = useToggle(false);

  const pickerRef = useRef<{
    onNewCollection: (item: CollectionPickerItem) => void;
  }>();

  const handleItemSelect = useCallback(
    async (item: CollectionPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else if (canSelectItem(item)) {
        await onChange(item);
      }
    },
    [onChange, options],
  );

  const handleConfirm = async () => {
    if (selectedItem && canSelectItem(selectedItem)) {
      await onChange(selectedItem);
    }
  };

  const modalActions = options.allowCreateNew
    ? [
        <Button
          key="collection-on-the-go"
          miw="21rem"
          onClick={openCreateDialog}
          leftIcon={<Icon name="add" />}
          disabled={selectedItem?.can_write === false}
        >
          {t`Create a new collection`}
        </Button>,
      ]
    : [];

  const tabs: [EntityTab<SearchModel>] = [
    {
      displayName: t`Collections`,
      model: "collection",
      icon: "folder",
      element: (
        <CollectionPicker
          onItemSelect={handleItemSelect}
          shouldDisableItem={shouldDisableItem}
          initialValue={value}
          options={options}
          ref={pickerRef}
        />
      ),
    },
  ];

  const handleNewCollectionCreate = (newCollection: CollectionPickerItem) => {
    pickerRef.current?.onNewCollection(newCollection);
  };

  const composedSearchResultFilter = useCallback(
    (searchResults: SearchResult[]) => {
      if (searchResultFilter) {
        return searchFilter(searchResultFilter(searchResults));
      }
      return searchFilter(searchResults);
    },
    [searchResultFilter],
  );

  return (
    <>
      <EntityPickerModal
        title={title}
        onItemSelect={handleItemSelect}
        canSelectItem={!isCreateDialogOpen && canSelectItem(selectedItem)}
        onConfirm={handleConfirm}
        onClose={onClose}
        selectedItem={selectedItem}
        tabs={tabs}
        options={options}
        searchResultFilter={composedSearchResultFilter}
        recentFilter={recentFilter}
        actionButtons={modalActions}
        trapFocus={!isCreateDialogOpen}
      />
      <NewCollectionDialog
        isOpen={isCreateDialogOpen}
        onClose={closeCreateDialog}
        parentCollectionId={
          canSelectItem(selectedItem)
            ? selectedItem.id
            : canSelectItem(value)
            ? value.id
            : "root"
        }
        onNewCollection={handleNewCollectionCreate}
        namespace={options.namespace}
      />
    </>
  );
};
