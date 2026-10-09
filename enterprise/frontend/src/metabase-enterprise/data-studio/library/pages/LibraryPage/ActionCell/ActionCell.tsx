import type { CollectionRowModalState } from "metabase/common/collections/components/CollectionRowModal";
import {
  type LibrarySection,
  getItemSection,
} from "metabase/data-studio/common/hooks/use-library-bulk-selection";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  isCollectionData,
  isEmptyStateData,
  isTableData,
} from "metabase/data-studio/common/utils";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { TableMoreMenu } from "metabase-enterprise/data-studio/library/tables/components/TableHeader/TableMoreMenu";
import type { TableModalState } from "metabase-enterprise/data-studio/library/tables/components/TableModal";
import type { CollectionId } from "metabase-types/api";

import { LibraryCollectionRowMenu } from "../LibraryCollectionRowMenu";

type ActionCellProps = {
  treeItem: TreeItem;
  refreshSection: (
    section: LibrarySection,
    collectionIds: CollectionId[],
  ) => void;
  onOpenCollectionModal: (modal: CollectionRowModalState) => void;
  onOpenTableModal: (modal: TableModalState) => void;
};

export function ActionCell({
  treeItem,
  refreshSection,
  onOpenCollectionModal,
  onOpenTableModal,
}: ActionCellProps) {
  const { data, children } = treeItem;

  if (isEmptyStateData(data)) {
    return null;
  }

  if (isTableData(data)) {
    return (
      <TableMoreMenu
        table={data}
        onOpenModal={onOpenTableModal}
        onMoved={(collectionIds) => refreshSection("data", collectionIds)}
      />
    );
  }

  if (!isCollectionData(data) || data.model !== "collection") {
    return null;
  }

  const isLibraryCollection =
    PLUGIN_LIBRARY.isLibrarySubCollectionType(data.type) &&
    !data.is_library_root;

  const section = getItemSection(treeItem);

  if (isLibraryCollection && section != null) {
    return (
      <LibraryCollectionRowMenu
        childCount={children?.length ?? 0}
        collection={data}
        refreshCollections={(collectionIds) =>
          refreshSection(section, collectionIds)
        }
        onOpenModal={onOpenCollectionModal}
      />
    );
  }

  return null;
}
