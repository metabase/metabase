import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  type EntityType,
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
} from "metabase/collections/utils";
import { useToggle } from "metabase/common/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { RecentItem, SearchResult } from "metabase-types/api";

import {
  EntityPickerModal,
  type EntityPickerTab,
  defaultOptions,
} from "../../../EntityPicker";
import { useLogRecentItem } from "../../../EntityPicker/hooks/use-log-recent-item";
import { NewDashboardDialog } from "../../DashboardPicker/components/NewDashboardDialog";
import { getNamespaceForItem, isNamespaceRoot } from "../../utils";
import type {
  CollectionPickerItem,
  CollectionPickerModel,
  CollectionPickerOptions,
  CollectionPickerStatePath,
  CollectionPickerValueItem,
} from "../types";
import { getCollectionType } from "../types";

import { CollectionPicker } from "./CollectionPicker/CollectionPicker";
import { NewCollectionDialog } from "./NewCollectionDialog";

export interface CollectionPickerModalProps {
  title?: string;
  onChange: (item: CollectionPickerValueItem) => void;
  onClose: () => void;
  options?: CollectionPickerOptions;
  value?: Pick<CollectionPickerValueItem, "id" | "model" | "collection_id">;
  shouldDisableItem?: (item: CollectionPickerItem) => boolean;
  entityType?: EntityType;
  searchResultFilter?: (searchResults: SearchResult[]) => SearchResult[];
  recentFilter?: (recentItems: RecentItem[]) => RecentItem[];
  models?: CollectionPickerModel[];
  canSelectItem?: (item: CollectionPickerItem) => boolean;
}

const baseCanSelectItem = (
  item: Pick<CollectionPickerItem, "can_write" | "model"> | null | undefined,
): item is CollectionPickerValueItem => {
  return (
    !!item &&
    item.can_write !== false &&
    (item.model === "collection" || item.model === "dashboard")
  );
};

const searchFilter = (
  searchResults: SearchResult[],
  entityType?: EntityType,
): SearchResult[] => {
  return searchResults.filter((result) => {
    if (!result.can_write || result.collection.type === "trash") {
      return false;
    }

    if (result.model === "collection" && entityType) {
      return canPlaceEntityInCollection(entityType, result.collection_type);
    }

    return true;
  });
};

const recentItemFilter = (
  recentItems: RecentItem[],
  entityType?: EntityType,
): RecentItem[] => {
  if (!entityType) {
    return recentItems;
  }

  return recentItems.filter((item) => {
    if (item.model === "collection") {
      return canPlaceEntityInCollection(entityType, item.collection_type);
    }
    return true;
  });
};

export const CollectionPickerModal = ({
  title = t`Choose a collection`,
  onChange,
  onClose,
  value,
  options = defaultOptions,
  shouldDisableItem: shouldDisableItemProp,
  entityType,
  searchResultFilter,
  recentFilter,
  models: modelsProp,
  canSelectItem: _canSelectItem,
}: CollectionPickerModalProps) => {
  options = { ...defaultOptions, ...options };

  const models = modelsProp || ["collection"];

  const shouldDisableItem = useMemo(() => {
    const entityTypeCheck = entityType
      ? (item: CollectionPickerItem) => {
          if (item.model === "collection") {
            return !canPlaceEntityInCollectionOrDescendants(
              entityType,
              getCollectionType(item),
            );
          }
          return false;
        }
      : undefined;

    if (shouldDisableItemProp && entityTypeCheck) {
      return (item: CollectionPickerItem) => {
        return shouldDisableItemProp(item) || entityTypeCheck(item);
      };
    }

    return shouldDisableItemProp || entityTypeCheck;
  }, [shouldDisableItemProp, entityType]);

  const [selectedItem, setSelectedItem] = useState<CollectionPickerItem | null>(
    null,
  );

  // canSelectItem determines if the Confirm button should be enabled
  // Namespace roots can be navigated into but not selected as final destinations
  const canSelectItem = useCallback(
    (
      item:
        | Pick<CollectionPickerItem, "id" | "can_write" | "model">
        | null
        | undefined,
    ): item is CollectionPickerValueItem => {
      if (!baseCanSelectItem(item)) {
        return false;
      }

      if (_canSelectItem && !_canSelectItem(item)) {
        return false;
      }

      if (entityType && item.model === "collection") {
        const collectionType = getCollectionType(item as CollectionPickerItem);
        if (!canPlaceEntityInCollection(entityType, collectionType)) {
          return false;
        }
      }

      // Check if namespace root is disallowed for this savingModel
      if (
        options.savingModel !== "collection" &&
        isNamespaceRoot(item as CollectionPickerItem)
      ) {
        return false;
      }

      return true;
    },
    [_canSelectItem, entityType, options.savingModel],
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
    isCreateCollectionDialogOpen,
    {
      turnOn: openCreateCollectionDialog,
      turnOff: closeCreateCollectionDialog,
    },
  ] = useToggle(false);

  const [
    isCreateDashboardDialogOpen,
    { turnOn: openCreateDashboardDialog, turnOff: closeCreateDashboardDialog },
  ] = useToggle(false);

  const pickerRef = useRef<{
    onNewCollection: (item: CollectionPickerItem) => void;
    onNewDashboard: (item: CollectionPickerItem) => void;
  }>();

  const handleInit = useCallback((item: CollectionPickerItem) => {
    setSelectedItem((current) => current ?? item);
  }, []);

  const handleItemSelect = useCallback(
    async (item: CollectionPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else if (canSelectItem(item)) {
        await handleChange(item);
      }
    },
    [handleChange, options, canSelectItem],
  );

  const handleConfirm = async () => {
    if (selectedItem && canSelectItem(selectedItem)) {
      await handleChange(selectedItem);
    }
  };

  const canCreateCollectionInSelected =
    selectedItem?.can_write !== false &&
    (selectedItem?.model !== "collection" ||
      canPlaceEntityInCollection("collection", selectedItem.type));

  const modalActions = options.allowCreateNew
    ? _.compact([
        models.includes("dashboard") && (
          <Button
            key="dashboard-on-the-go"
            miw="9.5rem"
            onClick={openCreateDashboardDialog}
            leftSection={<Icon name="add_to_dash" />}
            disabled={Boolean(
              selectedItem?.can_write === false ||
                (selectedItem && isNamespaceRoot(selectedItem)),
            )}
          >
            {t`New dashboard`}
          </Button>
        ),
        <Button
          key="collection-on-the-go"
          miw="9.5rem"
          onClick={openCreateCollectionDialog}
          leftSection={<Icon name="collection" />}
          disabled={!canCreateCollectionInSelected}
        >
          {t`New collection`}
        </Button>,
      ])
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
      displayName: models.some((model) => model !== "collection")
        ? t`Browse`
        : t`Collections`,
      models: models,
      folderModels: ["collection"],
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

  const handleNewDashboardCreate = (newDashboard: CollectionPickerItem) => {
    pickerRef.current?.onNewDashboard(newDashboard);
  };

  const composedSearchResultFilter = useCallback(
    (searchResults: SearchResult[]) => {
      if (searchResultFilter) {
        return searchFilter(searchResultFilter(searchResults), entityType);
      }
      return searchFilter(searchResults, entityType);
    },
    [searchResultFilter, entityType],
  );

  const composedRecentFilter = useCallback(
    (recentItems: RecentItem[]) => {
      const filtered = recentItemFilter(recentItems, entityType);
      if (recentFilter) {
        return recentFilter(filtered);
      }
      return filtered;
    },
    [recentFilter, entityType],
  );

  const parentCollectionId = useMemo(() => {
    if (
      selectedItem &&
      isNamespaceRoot(selectedItem) &&
      selectedItem.can_write
    ) {
      return selectedItem.id;
    } else if (canSelectItem(selectedItem)) {
      return selectedItem.model === "dashboard"
        ? selectedItem.collection_id
        : selectedItem.id;
    } else if (canSelectItem(value)) {
      return value.model === "dashboard" ? value.collection_id : value.id;
    } else {
      return "root";
    }
  }, [selectedItem, value, canSelectItem]);

  // Determine the effective namespace for creating new collections
  // Priority: 1) options.namespace (explicit), 2) selectedItem namespace, 3) undefined
  const effectiveNamespace = useMemo(() => {
    // If explicitly set in options, use that
    if (options.namespace) {
      return options.namespace;
    }

    // Get namespace from the currently selected item
    return getNamespaceForItem(selectedItem);
  }, [options.namespace, selectedItem]);

  return (
    <>
      <EntityPickerModal
        title={title}
        onItemSelect={handleItemSelect}
        canSelectItem={
          !isCreateCollectionDialogOpen &&
          !isCreateDashboardDialogOpen &&
          canSelectItem(selectedItem)
        }
        onConfirm={handleConfirm}
        onClose={onClose}
        selectedItem={selectedItem}
        tabs={tabs}
        options={options}
        searchResultFilter={composedSearchResultFilter}
        recentFilter={composedRecentFilter}
        actionButtons={modalActions}
        trapFocus={!isCreateCollectionDialogOpen}
        disableCloseOnEscape={
          isCreateCollectionDialogOpen || isCreateDashboardDialogOpen
        }
      />
      <NewCollectionDialog
        isOpen={isCreateCollectionDialogOpen}
        onClose={closeCreateCollectionDialog}
        parentCollectionId={parentCollectionId}
        onNewCollection={handleNewCollectionCreate}
        namespace={effectiveNamespace}
      />
      <NewDashboardDialog
        isOpen={isCreateDashboardDialogOpen}
        onClose={closeCreateDashboardDialog}
        parentCollectionId={parentCollectionId}
        onNewDashboard={handleNewDashboardCreate}
      />
    </>
  );
};
