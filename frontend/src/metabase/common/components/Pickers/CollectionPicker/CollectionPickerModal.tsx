import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  type EntityType,
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
} from "metabase/collections/utils";
import { PLUGIN_TENANTS } from "metabase/plugins/oss/tenants";

import {
  EntityPickerModal,
  type EntityPickerModalProps,
  type OmniPickerItem,
} from "../EntityPicker";
import { getCollectionType } from "../EntityPicker/utils";

import type { CollectionPickerValueItem } from "./types";

const baseCanSelectItem = (
  item: OmniPickerItem,
): item is CollectionPickerValueItem => {
  return (
    !!item &&
    "can_write" in item &&
    item.can_write !== false &&
    (item.model === "collection" || item.model === "dashboard")
  );
};

export type CollectionPickerModalProps = Omit<
  EntityPickerModalProps,
  "models" | "onChange"
> & {
  entityType?: EntityType;
  onChange: (newItem: CollectionPickerValueItem) => void;
};

/**
 * A picker that only picks collections or dashboards
 */
export const CollectionPickerModal = ({
  title = t`Choose a collection`,
  entityType,
  isDisabledItem: isDisabledItemProp,
  isHiddenItem: isHiddenItemProp,
  isSelectableItem: isSelectableItemProp,
  onChange,
  ...props
}: CollectionPickerModalProps) => {
  const shouldDisableItem = useMemo(() => {
    const entityTypeCheck = entityType
      ? (item: OmniPickerItem) => {
          if (item.model === "collection") {
            return !canPlaceEntityInCollectionOrDescendants(
              entityType,
              getCollectionType(item),
            );
          }
          return false;
        }
      : undefined;

    if (isDisabledItemProp && entityTypeCheck) {
      return (item: OmniPickerItem) => {
        return isDisabledItemProp(item) || entityTypeCheck(item);
      };
    }

    return isDisabledItemProp || entityTypeCheck;
  }, [isDisabledItemProp, entityType]);

  // dashboards act as collections for cards
  const models: EntityPickerModalProps["models"] =
    entityType === "card" ? ["dashboard", "collection"] : ["collection"];

  // canSelectItem determines if the Confirm button should be enabled
  // Namespace roots can be navigated into but not selected as final destinations
  const canSelectItem = useCallback(
    (item: OmniPickerItem): item is CollectionPickerValueItem => {
      if (!baseCanSelectItem(item)) {
        return false;
      }

      if (isSelectableItemProp && !isSelectableItemProp(item)) {
        return false;
      }

      if (entityType && item.model === "collection") {
        const collectionType = getCollectionType(item);
        if (!canPlaceEntityInCollection(entityType, collectionType)) {
          return false;
        }
      }

      if (
        !PLUGIN_TENANTS.canPlaceEntityInCollection({
          entityType,
          collection: item,
        })
      ) {
        return false;
      }

      return true;
    },
    [entityType, isSelectableItemProp],
  );

  const handleChange = (newItem: OmniPickerItem) => {
    if (canSelectItem(newItem)) {
      onChange(newItem);
    }
  };

  return (
    <EntityPickerModal
      title={title}
      isDisabledItem={shouldDisableItem}
      isSelectableItem={canSelectItem}
      {...props}
      onChange={handleChange}
      models={models}
    />
  );
};
