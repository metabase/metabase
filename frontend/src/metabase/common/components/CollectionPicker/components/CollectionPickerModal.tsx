import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { RecentItem, SearchResult } from "metabase-types/api";

import type { EntityPickerTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import { useLogRecentItem } from "../../EntityPicker/hooks/use-log-recent-item";
import type {
  CollectionPickerItem,
  CollectionPickerModel,
  CollectionPickerOptions,
  CollectionPickerStatePath,
  CollectionPickerValueItem,
} from "../types";

import { CollectionPicker } from "./CollectionPicker";
import { NewCollectionDialog } from "./NewCollectionDialog";

export interface CollectionPickerModalProps {
  title?: string;
  onChange: (item: CollectionPickerValueItem) => void;
  onClose: () => void;
  options?: CollectionPickerOptions;
  value: Pick<CollectionPickerValueItem, "id" | "model" | "collection_id">;
  shouldDisableItem?: (item: CollectionPickerItem) => boolean;
  searchResultFilter?: (searchResults: SearchResult[]) => SearchResult[];
  recentFilter?: (recentItems: RecentItem[]) => RecentItem[];
  models?: CollectionPickerModel[];
}

const canSelectItem = (
  item: Pick<CollectionPickerItem, "can_write" | "model"> | null,
): item is CollectionPickerValueItem => {
  return (
    !!item &&
    item.can_write !== false &&
    (item.model === "collection" || item.model === "dashboard")
  );
};

const searchFilter = (searchResults: SearchResult[]): SearchResult[] => {
  return searchResults.filter(
    result => result.can_write && result.collection.type !== "trash",
  );
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
  models = ["collection"],
}: CollectionPickerModalProps) => {
  options = { ...defaultOptions, ...options };
  const [selectedItem, setSelectedItem] = useState<CollectionPickerItem | null>(
    null,
  );

  const { tryLogRecentItem } = useLogRecentItem();

  const handleChange = useCallback(
    async (item: CollectionPickerValueItem) => {
      await onChange(item);
      tryLogRecentItem(item);
    },
    [onChange, tryLogRecentItem],
  );

  const [
    isCreateDialogOpen,
    { turnOn: openCreateDialog, turnOff: closeCreateDialog },
  ] = useToggle(false);

  const pickerRef = useRef<{
    onNewCollection: (item: CollectionPickerItem) => void;
  }>();

  const handleInit = useCallback((item: CollectionPickerItem) => {
    setSelectedItem(current => current ?? item);
  }, []);

  const handleItemSelect = useCallback(
    async (item: CollectionPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else if (canSelectItem(item)) {
        await handleChange(item);
      }
    },
    [handleChange, options],
  );

  const handleConfirm = async () => {
    if (selectedItem && canSelectItem(selectedItem)) {
      await handleChange(selectedItem);
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

  const [collectionsPath, setCollectionsPath] =
    useState<CollectionPickerStatePath>();

  const tabs: EntityPickerTab<
    CollectionPickerItem["id"],
    CollectionPickerItem["model"],
    CollectionPickerItem
  >[] = [
    {
      id: "collections-tab",
      displayName: models.some(model => model !== "collection")
        ? t`Browse`
        : t`Collections`,
      models,
      folderModels: ["collection" as const],
      icon: "folder",
      render: ({ onItemSelect }) => (
        <CollectionPicker
          initialValue={value}
          options={options}
          path={collectionsPath}
          ref={pickerRef}
          shouldDisableItem={shouldDisableItem}
          onInit={handleInit}
          onItemSelect={onItemSelect}
          onPathChange={setCollectionsPath}
          models={models}
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

  const parentCollectionId = useMemo(() => {
    if (canSelectItem(selectedItem)) {
      return selectedItem.model === "dashboard"
        ? selectedItem.collection_id
        : selectedItem.id;
    } else if (canSelectItem(value)) {
      return value.model === "dashboard" ? value.collection_id : value.id;
    } else {
      return "root";
    }
  }, [selectedItem, value]);

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
        parentCollectionId={parentCollectionId}
        onNewCollection={handleNewCollectionCreate}
        namespace={options.namespace}
      />
    </>
  );
};
