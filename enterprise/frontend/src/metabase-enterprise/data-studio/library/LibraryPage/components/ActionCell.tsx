import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  isCollectionData,
  isEmptyStateData,
  isTableData,
} from "metabase/data-studio/common/utils";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { TableMoreMenu } from "metabase-enterprise/data-studio/library/tables/components/TableHeader/TableMoreMenu";
import type { CollectionId } from "metabase-types/api";

import { LibraryCollectionRowMenu } from "./LibraryCollectionRowMenu";
import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";

type ActionCellProps = {
  treeItem: TreeItem;
  refreshCollections: (collectionIds: CollectionId[]) => void;
};

export function ActionCell(props: ActionCellProps) {
  const { treeItem, refreshCollections } = props;
  const { data, children } = treeItem;

  if (isEmptyStateData(data)) {
    return null;
  }

  if (isTableData(data)) {
    return <TableMoreMenu table={data} onMoved={refreshCollections} />;
  }

  if (!isCollectionData(data) || data.model !== "collection") {
    return null;
  }

  const isSnippetCollection = data.namespace === "snippets";

  if (isSnippetCollection && data.id === "root") {
    return <RootSnippetsCollectionMenu collectionId={data.id} />;
  }

  if (isSnippetCollection) {
    return <CollectionRowMenu collection={data} />;
  }

  // Includes the seeded Data/Metrics roots: they can't be renamed or archived, but they can still
  // take a new subfolder, a custom icon and permission changes.
  if (PLUGIN_LIBRARY.isLibraryCollectionType(data.type)) {
    return (
      <LibraryCollectionRowMenu
        childCount={children?.length ?? 0}
        collection={data}
        refreshCollections={refreshCollections}
      />
    );
  }

  return null;
}
