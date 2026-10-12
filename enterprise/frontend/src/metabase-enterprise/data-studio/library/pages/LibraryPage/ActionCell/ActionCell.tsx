import type { CollectionRowModalState } from "metabase/common/collections/components/CollectionRowModal";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  isCollectionData,
  isEmptyStateData,
  isTableData,
} from "metabase/data-studio/common/utils";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { TableMoreMenu } from "metabase-enterprise/data-studio/library/tables/components/TableHeader/TableMoreMenu";
import type { TableModalState } from "metabase-enterprise/data-studio/library/tables/components/TableModal";

import { LibraryCollectionRowMenu } from "../LibraryCollectionRowMenu";

type ActionCellProps = {
  treeItem: TreeItem;
  onOpenCollectionModal: (modal: CollectionRowModalState) => void;
  onOpenTableModal: (modal: TableModalState) => void;
};

export function ActionCell({
  treeItem,
  onOpenCollectionModal,
  onOpenTableModal,
}: ActionCellProps) {
  const { data, children } = treeItem;

  if (isEmptyStateData(data)) {
    return null;
  }

  if (isTableData(data)) {
    return <TableMoreMenu table={data} onOpenModal={onOpenTableModal} />;
  }

  if (!isCollectionData(data)) {
    return null;
  }

  const isLibraryCollection =
    PLUGIN_LIBRARY.isLibrarySubCollectionType(data.type) &&
    !data.is_library_root;

  if (isLibraryCollection) {
    return (
      <LibraryCollectionRowMenu
        childCount={children?.length ?? 0}
        collection={data}
        onOpenModal={onOpenCollectionModal}
      />
    );
  }

  return null;
}
