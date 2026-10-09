import { t } from "ttag";

import type {
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers/EntityPicker/types";
import { allCollectionModels } from "metabase/common/components/Pickers/utils";
import type {
  GetEntityPickerSyntheticLibraryItemFunction,
  LibrarySubCollectionType,
} from "metabase/plugins/oss/library";
import type { CollectionItem } from "metabase-types/api";

type LibrarySectionCollectionItem = CollectionItem &
  OmniPickerCollectionItem & {
    model: "collection";
    type: LibrarySubCollectionType;
  };

function getLibrarySectionName(type: LibrarySubCollectionType) {
  switch (type) {
    case "library-data":
      return t`Data`;
    case "library-metrics":
      return t`Metrics`;
    case "library-dashboards":
      return t`Dashboards`;
  }
}

export function getCollectionPickerItems({
  parentItem,
  items,
}: {
  parentItem: OmniPickerItem;
  items: CollectionItem[];
}): OmniPickerItem[] | undefined {
  if (parentItem.model !== "collection" || parentItem.type !== "library") {
    return undefined;
  }

  const librarySubCollectionType: LibrarySubCollectionType[] = [
    "library-data",
    "library-metrics",
    "library-dashboards",
  ];

  return librarySubCollectionType.flatMap((type) => {
    const sectionItems = items.filter((item) =>
      isLibrarySectionCollectionItem(item, type),
    );

    const realRoot = sectionItems.find((item) => item.is_library_root);
    if (realRoot) {
      return [realRoot];
    }

    if (sectionItems.length > 0) {
      const syntheticItem = getEntityPickerSyntheticLibraryItem({
        collectionId: parentItem.id,
        type,
      });

      return syntheticItem ? [syntheticItem] : [];
    }

    return [];
  });
}

function isLibrarySectionCollectionItem(
  item: CollectionItem,
  type: LibrarySubCollectionType,
): item is LibrarySectionCollectionItem {
  return item.model === "collection" && item.type === type;
}

export const getEntityPickerSyntheticLibraryItem: GetEntityPickerSyntheticLibraryItemFunction =
  ({ collectionId, type }) => {
    return {
      id: `${type}-${collectionId}`,
      sourceCollectionId: collectionId,
      name: getLibrarySectionName(type),
      model: "collection",
      type,
      can_write: false,
      location: "/",
      here: [],
      below: allCollectionModels,
      childTypeFilter: type,
    };
  };

export const getLibraryCollectionEmptyStateMessages = (
  type: LibrarySubCollectionType,
) => {
  if (type === "library-data") {
    return {
      title: t`No published tables yet`,
      description: t`Publish tables in the semantic layer to see them here.`,
    };
  }

  if (type === "library-dashboards") {
    return {
      title: t`No dashboards yet`,
      description: t`Put dashboards in the semantic layer to see them here.`,
    };
  }

  return {
    title: t`No metrics yet`,
    description: t`Put metrics in the semantic layer to see them here.`,
  };
};

export const isLibrarySubCollectionType = (
  type?: string | null,
): type is LibrarySubCollectionType => {
  return (
    type === "library-data" ||
    type === "library-metrics" ||
    type === "library-dashboards"
  );
};

export const isLibraryDataCollectionType = (
  type?: string | null,
): type is "library-data" => {
  return type === "library-data";
};

export const isLibraryCollectionType = (
  type?: string | null,
): type is LibrarySubCollectionType => {
  return isLibrarySubCollectionType(type) || type === "library";
};
