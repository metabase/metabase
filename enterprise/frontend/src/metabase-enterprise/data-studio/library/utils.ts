import type { ReactNode } from "react";
import { c, t } from "ttag";

import type {
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers/EntityPicker/types";
import { allCollectionModels } from "metabase/common/components/Pickers/utils";
import {
  LIBRARY_SECTIONS,
  getLibrarySectionName,
} from "metabase/common/data-studio/library-sections";
import type { GetEntityPickerSyntheticLibraryItemFunction } from "metabase/plugins/oss/library";
import {
  type Collection,
  type CollectionEssentials,
  type CollectionItem,
  type CollectionType,
  LIBRARY_SUB_COLLECTION_TYPES,
  type LibraryCollectionType,
  type LibrarySubCollectionType,
} from "metabase-types/api";
import { isLibrarySubCollectionType } from "metabase-types/guards/collection";

import type { LibraryItemModel } from "./types";

type LibrarySectionCollectionItem = CollectionItem &
  OmniPickerCollectionItem & {
    model: "collection";
    type: LibrarySubCollectionType;
  };

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

  return LIBRARY_SUB_COLLECTION_TYPES.flatMap((type) => {
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
  switch (type) {
    case "library-data":
      return {
        title: t`No published tables yet`,
        description: t`Publish tables in the semantic layer to see them here.`,
      };
    case "library-metrics":
      return {
        title: t`No metrics yet`,
        description: t`Put metrics in the semantic layer to see them here.`,
      };
    case "library-dashboards":
      return {
        title: t`No dashboards yet`,
        description: t`Put dashboards in the semantic layer to see them here.`,
      };
    case "library-documents":
      return {
        title: t`No documents yet`,
        description: t`Put documents in the semantic layer to see them here.`,
      };
  }
};

export const isLibraryDataCollectionType = (
  type?: string | null,
): type is "library-data" => {
  return type === "library-data";
};

export const isLibraryCollectionType = (
  type?: string | null,
): type is LibraryCollectionType => {
  return isLibrarySubCollectionType(type) || type === "library";
};

/** The Library section collection of `type` that the collection tree holds */
export function getAccessibleCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  return rootCollection.children?.find(
    (collection) => collection.type === type,
  );
}

/**
 * The folders below the section on a collection path, or `undefined` when the
 * path does not pass through the section at all
 */
export function getLibrarySectionFolders(
  path: CollectionEssentials[],
  sectionType: LibrarySubCollectionType,
): CollectionEssentials[] | undefined {
  const sectionIndex = path.findIndex(
    (collection) => collection.type === sectionType,
  );
  return sectionIndex === -1 ? undefined : path.slice(sectionIndex + 1);
}

const LIBRARY_ITEM_SECTION_TYPES = {
  dashboard: "library-dashboards",
  document: "library-documents",
} as const satisfies Record<LibraryItemModel, LibrarySubCollectionType>;

type LibraryItemSectionType =
  (typeof LIBRARY_ITEM_SECTION_TYPES)[LibraryItemModel];

type LibraryItemSection = (typeof LIBRARY_SECTIONS)[LibraryItemSectionType] & {
  type: LibraryItemSectionType;
  /** The item noun in running text, e.g. "This dashboard is in the trash." */
  entityName: string;
  newItemLabel: string;
  pageMenuLabel: string;
  notFoundTitle: string;
  outsideLibraryTitle: string;
  getTrashedFolderMessage: (folderLink: ReactNode) => ReactNode;
};

/** The Library section that holds items of `model`, and how its pages name the item */
export function getLibraryItemSection(
  model: LibraryItemModel,
): LibraryItemSection {
  const type = LIBRARY_ITEM_SECTION_TYPES[model];
  const section = LIBRARY_SECTIONS[type];
  switch (model) {
    case "dashboard":
      return {
        type,
        ...section,
        entityName: t`dashboard`,
        newItemLabel: t`Dashboard`,
        pageMenuLabel: t`Dashboard options`,
        notFoundTitle: t`Dashboard not found`,
        outsideLibraryTitle: t`This dashboard isn't in the Library`,
        getTrashedFolderMessage: (folderLink) =>
          c("{0} is a link to the folder that is in the trash")
            .jt`This dashboard is in the trash because its folder ${folderLink} is.`,
      };
    case "document":
      return {
        type,
        ...section,
        entityName: t`document`,
        newItemLabel: t`Document`,
        pageMenuLabel: t`Document options`,
        notFoundTitle: t`Document not found`,
        outsideLibraryTitle: t`This document isn't in the Library`,
        getTrashedFolderMessage: (folderLink) =>
          c("{0} is a link to the folder that is in the trash")
            .jt`This document is in the trash because its folder ${folderLink} is.`,
      };
  }
}
