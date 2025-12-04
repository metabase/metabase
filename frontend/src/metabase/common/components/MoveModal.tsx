import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import type {
  MoveCollectionDestination,
  MoveDestination,
  OnMoveWithOneItem,
} from "metabase/collections/types";
import {
  type EntityType,
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
  isItemCollection,
} from "metabase/collections/utils";
import {
  type CollectionPickerItem,
  CollectionPickerModal,
  type CollectionPickerModel,
  type CollectionPickerValueItem,
  getCollectionType,
} from "metabase/common/components/Pickers/CollectionPicker";
import { SHARED_TENANT_NAMESPACE } from "metabase/common/components/Pickers/utils";
import type {
  CollectionId,
  CollectionItem,
  RecentItem,
  SearchResult,
} from "metabase-types/api";

interface BaseMoveModalProps {
  title: string;
  onClose: () => void;
  initialCollectionId: CollectionId;
  movingCollectionId?: CollectionId;
  entityType?: EntityType;
  recentAndSearchFilter?: (item: CollectionPickerItem) => boolean;
  /**
   * The type of item being moved. When set to a non-collection model,
   * namespace root collections (like tenant root) will be disabled.
   */
  savingModel?: "collection" | "dashboard" | "question" | "model";
  /**
   * The namespace of the collection being moved. Used to restrict which
   * collections are shown in the picker:
   * - If "shared-tenant-collection", only tenant collections are shown
   * - Otherwise, tenant collections are hidden from the picker
   */
  movingCollectionNamespace?: string;
}

type MoveModalProps =
  | (BaseMoveModalProps & {
      canMoveToDashboard?: true | undefined;
      onMove: OnMoveWithOneItem;
    })
  | (BaseMoveModalProps & {
      canMoveToDashboard?: false;
      onMove: OnMoveWithOneItem<MoveCollectionDestination>;
    });

const makeRecentFilter = (
  disableFns: (((item: CollectionPickerItem) => boolean) | undefined)[],
) => {
  return (recentItems: RecentItem[]) =>
    recentItems.filter((result) =>
      disableFns
        .map((disableFn) => !disableFn?.(result as CollectionPickerItem))
        .every((val) => val === true),
    );
};

const makeSearchResultFilter = (
  disableFns: (((item: CollectionPickerItem) => boolean) | undefined)[],
) => {
  return (searchResults: SearchResult[]) =>
    searchResults.filter((result) =>
      disableFns
        .map((disableFn) => !disableFn?.(result as CollectionPickerItem))
        .every((val) => val === true),
    );
};

export const MoveModal = ({
  title,
  onClose,
  onMove,
  initialCollectionId,
  movingCollectionId,
  entityType,
  canMoveToDashboard,
  recentAndSearchFilter,
  savingModel,
  movingCollectionNamespace,
}: MoveModalProps) => {
  const isMovingTenantCollection =
    movingCollectionNamespace === SHARED_TENANT_NAMESPACE;
  const shouldDisableItem = (item: CollectionPickerItem): boolean => {
    if (movingCollectionId) {
      if (
        item.id === movingCollectionId ||
        (item.effective_location ?? item?.location)
          ?.split("/")
          .includes(String(movingCollectionId))
      ) {
        return true;
      }
    }

    if (entityType && item.model === "collection") {
      return !canPlaceEntityInCollectionOrDescendants(
        entityType,
        getCollectionType(item),
      );
    }

    return false;
  };

  const searchResultFilter = makeSearchResultFilter([
    shouldDisableItem,
    recentAndSearchFilter,
  ]);

  const recentFilter = makeRecentFilter([
    (item) => {
      return Boolean(!item.can_write || shouldDisableItem?.(item));
    },
    recentAndSearchFilter,
  ]);

  const handleMove = useCallback(
    (destination: CollectionPickerValueItem) => {
      // GROSS:
      // - CollectionPicker's `onChange` prop isn't generic to its `models` prop, so
      //   `onChange`'s destination arg isn't narrowed based on the `models` passed in. This
      //   requires we do additional type gauarding / unneeded error handling below.
      // - To keep this same issue from bubbling up to consumers of MoveModal, we need
      //   do some extra type casting so it has an external API where `canMoveToDashboard`
      //   narrows the `destination` arg for its `onMove` prop.
      // - Making CollectionPicker properly generic is hard due to some internal typing
      //   being used by components other than the CollectionPicker. One type
      //   cast here avoids a large headache-inducing refactor there.

      if (!canMoveToDashboard) {
        if (destination.model === "dashboard") {
          throw new Error(
            "MoveModal can't move to a dashboard with canMoveToDashboard=false",
          );
        }

        return onMove({ id: destination.id, model: destination.model });
      } else {
        return onMove({
          id: destination.id,
          model: destination.model,
        } as MoveDestination);
      }
    },
    [onMove, canMoveToDashboard],
  );

  const models: CollectionPickerModel[] = canMoveToDashboard
    ? ["collection", "dashboard"]
    : ["collection"];

  // Determine namespace restriction for the picker:
  // - If moving a tenant collection, only show tenant hierarchy
  // - If moving a regular collection, hide tenant collections
  const restrictToNamespace = isMovingTenantCollection
    ? SHARED_TENANT_NAMESPACE
    : "default";

  return (
    <CollectionPickerModal
      title={title}
      value={{
        id: initialCollectionId,
        model: "collection",
      }}
      onChange={handleMove}
      models={models}
      options={{
        showSearch: !isMovingTenantCollection,
        allowCreateNew: true,
        hasConfirmButtons: true,
        showRootCollection: !isMovingTenantCollection,
        showPersonalCollections: !isMovingTenantCollection,
        confirmButtonText: t`Move`,
        savingModel,
        hasRecents: !isMovingTenantCollection,
        restrictToNamespace,
      }}
      shouldDisableItem={shouldDisableItem}
      entityType={entityType}
      searchResultFilter={searchResultFilter}
      recentFilter={recentFilter}
      onClose={onClose}
    />
  );
};

interface BulkMoveModalProps {
  onClose: () => void;
  onMove: OnMoveWithOneItem<MoveDestination>;
  selectedItems: CollectionItem[];
  initialCollectionId: CollectionId;
  recentAndSearchFilter?: (item: CollectionPickerItem) => boolean;
}

export const BulkMoveModal = ({
  onClose,
  onMove,
  selectedItems,
  initialCollectionId,
  recentAndSearchFilter,
}: BulkMoveModalProps) => {
  const movingCollectionIds = selectedItems
    .filter((item: CollectionItem) => isItemCollection(item))
    .map((item: CollectionItem) => String(item.id));

  const shouldDisableItem = (item: CollectionPickerItem): boolean => {
    if (movingCollectionIds.length > 0) {
      const collectionItemFullPath =
        (item?.effective_location ?? item?.location)
          ?.split("/")
          .map(String)
          .concat(String(item.id)) ?? [];
      if (
        _.intersection(collectionItemFullPath, movingCollectionIds).length > 0
      ) {
        return true;
      }
    }

    if (item.model === "collection") {
      const hasInvalidItem = selectedItems.some(
        (selectedItem) =>
          !canPlaceEntityInCollectionOrDescendants(
            selectedItem.model,
            getCollectionType(item),
          ),
      );
      if (hasInvalidItem) {
        return true;
      }
    }

    return false;
  };

  const searchResultFilter = makeSearchResultFilter([
    shouldDisableItem,
    recentAndSearchFilter,
  ]);
  const recentFilter = makeRecentFilter([
    shouldDisableItem,
    recentAndSearchFilter,
  ]);

  const title =
    selectedItems.length > 1
      ? t`Move ${selectedItems.length} items?`
      : t`Move "${selectedItems[0].name}"?`;

  const canMoveToDashboard = selectedItems.every(
    (item) => item.model === "card",
  );

  const models: CollectionPickerModel[] = canMoveToDashboard
    ? ["collection", "dashboard"]
    : ["collection"];

  const canSelectItem = useCallback(
    (item: CollectionPickerItem) => {
      if (item.model === "collection") {
        return selectedItems.every((selectedItem) =>
          canPlaceEntityInCollection(
            selectedItem.model,
            getCollectionType(item),
          ),
        );
      }
      return true;
    },
    [selectedItems],
  );

  const handleMove = useCallback(
    async (destination: CollectionPickerValueItem) => {
      return onMove({
        id: destination.id,
        model: destination.model,
      });
    },
    [onMove],
  );

  return (
    <CollectionPickerModal
      title={title}
      value={{
        id: initialCollectionId,
        model: "collection",
      }}
      onChange={handleMove}
      options={{
        showSearch: true,
        allowCreateNew: true,
        hasConfirmButtons: true,
        showRootCollection: true,
        showPersonalCollections: true,
        confirmButtonText: t`Move`,
      }}
      shouldDisableItem={shouldDisableItem}
      canSelectItem={canSelectItem}
      searchResultFilter={searchResultFilter}
      recentFilter={recentFilter}
      onClose={onClose}
      models={models}
    />
  );
};
