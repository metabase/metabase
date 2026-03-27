import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import type {
  MoveCollectionDestination,
  MoveDestination,
  OnMoveWithOneItem,
} from "metabase/collections/types";
import {
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
  isItemCollection,
} from "metabase/collections/utils";
import {
  EntityPickerModal,
  isInDbTree,
} from "metabase/common/components/Pickers";
import { isItemInCollectionOrItsDescendants } from "metabase/common/components/Pickers/utils";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { CollectionId, CollectionItem } from "metabase-types/api";

import type {
  EntityPickerModalProps,
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "../EntityPicker";
import { getCollectionType, getValidNamespaces } from "../EntityPicker/utils";

interface BaseMoveModalProps {
  title: string;
  onClose: () => void;
  movingItem: OmniPickerCollectionItem;
  isDisabledItem?: (item: OmniPickerCollectionItem) => boolean;
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

export const MoveModal = ({
  title,
  onClose,
  onMove,
  movingItem,
  canMoveToDashboard,
  isDisabledItem,
}: MoveModalProps) => {
  const shouldDisableItem = useCallback(
    (item: OmniPickerItem): boolean => {
      if (!movingItem) {
        return false;
      }

      if (isInDbTree(item)) {
        return true;
      }

      if (movingItem.model === "collection") {
        // can't move a collection into itself or its descendants
        if (isItemInCollectionOrItsDescendants(item, movingItem.id)) {
          return true;
        }
      }

      if (item.model === "collection") {
        return !canPlaceEntityInCollectionOrDescendants(
          movingItem.model,
          getCollectionType(item),
        );
      }

      if (
        !isInDbTree(item) &&
        !isInDbTree(movingItem) &&
        item.namespace &&
        movingItem.namespace
      ) {
        // collections cannot move between namespaces
        return item.namespace !== movingItem.namespace;
      }

      if (isDisabledItem) {
        return isDisabledItem(item as OmniPickerCollectionItem);
      }

      return false;
    },
    [movingItem, isDisabledItem],
  );

  const canSelectItem = useCallback(
    (item: OmniPickerItem): boolean => {
      if (isInDbTree(item)) {
        return false;
      }

      if (shouldDisableItem(item)) {
        return false;
      }

      if (
        !PLUGIN_TENANTS.canPlaceEntityInCollection({
          entityType: movingItem.model,
          collection: item,
        })
      ) {
        return false;
      }

      if (isSameDestination(movingItem, item)) {
        return false;
      }

      return true;
    },
    [movingItem, shouldDisableItem],
  );

  const handleMove = useCallback(
    (destination: OmniPickerItem) => {
      // GROSS:
      // - CollectionPicker's `onChange` prop isn't generic to its `models` prop, so
      //   `onChange`'s destination arg isn't narrowed based on the `models` passed in. This
      //   requires we do additional type guarding / unneeded error handling below.
      // - To keep this same issue from bubbling up to consumers of MoveModal, we need
      //   do some extra type casting so it has an external API where `canMoveToDashboard`
      //   narrows the `destination` arg for its `onMove` prop.
      // - Making CollectionPicker properly generic is hard due to some internal typing
      //   being used by components other than the CollectionPicker. One type
      //   cast here avoids a large headache-inducing refactor there.

      if (
        destination.model !== "collection" &&
        destination.model !== "dashboard"
      ) {
        throw new Error("MoveModal can only move to collections or dashboards");
      }

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

  const models: ("dashboard" | "collection")[] = canMoveToDashboard
    ? ["collection", "dashboard"]
    : ["collection"];

  return (
    <EntityPickerModal
      title={title}
      value={{
        id: movingItem?.collection?.id || "root", // start with the current parent
        model: "collection",
        namespace: movingItem?.collection?.namespace,
      }}
      onChange={handleMove}
      models={models}
      namespaces={getValidNamespaces(movingItem)}
      options={{
        hasSearch: true,
        hasRecents: true,
        hasLibrary: true,
        hasRootCollection: true,
        hasConfirmButtons: true,
        canCreateCollections: true,
        hasPersonalCollections: true,
        confirmButtonText: t`Move`,
      }}
      isDisabledItem={shouldDisableItem}
      isSelectableItem={canSelectItem}
      onClose={onClose}
    />
  );
};

interface BulkMoveModalProps {
  onClose: () => void;
  onMove: OnMoveWithOneItem<MoveDestination>;
  selectedItems: CollectionItem[];
  initialCollectionId: CollectionId;
  recentAndSearchFilter?: (item: OmniPickerItem) => boolean;
}

export const BulkMoveModal = ({
  onClose,
  onMove,
  selectedItems,
  initialCollectionId,
}: BulkMoveModalProps) => {
  const movingCollectionIds = selectedItems
    .filter((item: OmniPickerCollectionItem) => isItemCollection(item))
    .map((item: OmniPickerCollectionItem) => String(item.id));

  const shouldDisableItem = useCallback(
    (item: OmniPickerItem): boolean => {
      if (isInDbTree(item)) {
        return true;
      }

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
    },
    [selectedItems, movingCollectionIds],
  );

  const canSelectItem = useCallback(
    (item: OmniPickerItem): boolean => {
      if (isInDbTree(item)) {
        return false;
      }
      if (shouldDisableItem(item)) {
        return false;
      }

      if (
        !selectedItems.every((item) =>
          PLUGIN_TENANTS.canPlaceEntityInCollection({
            entityType: item.model,
            collection: item,
          }),
        )
      ) {
        return false;
      }

      if (isSameDestination(selectedItems[0], item)) {
        return false;
      }

      return true;
    },
    [selectedItems, shouldDisableItem],
  );

  const title =
    selectedItems.length > 1
      ? t`Move ${selectedItems.length} items?`
      : t`Move "${selectedItems[0].name}"?`;

  const canMoveToDashboard = selectedItems.every(
    (item) => item.model === "card",
  );

  const models: EntityPickerModalProps["models"] = canMoveToDashboard
    ? ["collection", "dashboard"]
    : ["collection"];

  const shouldHideItem = useCallback(
    (item: OmniPickerItem) => {
      if (item.model === "collection") {
        return !selectedItems.every((selectedItem) =>
          canPlaceEntityInCollection(
            selectedItem.model,
            getCollectionType(item),
          ),
        );
      }
      return false;
    },
    [selectedItems],
  );

  const handleMove = useCallback(
    async (destination: OmniPickerItem) => {
      return onMove({
        id: destination.id,
        model: destination.model,
      } as MoveDestination);
    },
    [onMove],
  );

  const namespaces = getValidNamespaces(selectedItems[0]);
  const initialNamespace =
    selectedItems[0].namespace ?? selectedItems[0].collection_namespace;

  return (
    <EntityPickerModal
      title={title}
      value={{
        id: initialCollectionId,
        model: "collection",
        namespace: initialNamespace,
      }}
      onChange={handleMove}
      models={models}
      namespaces={namespaces}
      options={{
        hasSearch: true,
        hasRecents: true,
        hasRootCollection: true,
        hasConfirmButtons: true,
        canCreateCollections: true,
        confirmButtonText: t`Move`,
      }}
      isDisabledItem={shouldDisableItem}
      isSelectableItem={canSelectItem}
      isHiddenItem={shouldHideItem}
      onClose={onClose}
    />
  );
};

const isSameDestination = (
  movingItem: OmniPickerCollectionItem,
  movingTarget: OmniPickerCollectionItem,
) => {
  if (
    movingTarget.model === "dashboard" &&
    movingItem.dashboard_id === movingTarget.id
  ) {
    return true;
  }

  if (
    movingTarget.model === "collection" &&
    movingItem.collection?.id === movingTarget.id
  ) {
    return true;
  }
  return false;
};
