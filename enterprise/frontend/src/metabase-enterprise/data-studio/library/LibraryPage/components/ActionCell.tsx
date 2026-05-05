import type { TreeItem } from "metabase/data-studio/common/types";
import {
  isCollection,
  isEmptyStateData,
} from "metabase/data-studio/common/utils";
import { TableMoreMenu } from "metabase-enterprise/data-studio/library/tables/components/TableHeader/TableMoreMenu";
import { SnippetCollectionMenu } from "metabase-enterprise/snippets/components/SnippetCollectionMenu";
import type { CollectionId } from "metabase-types/api";

import { LibraryCollectionRowMenu } from "./LibraryCollectionRowMenu";
import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";

type ActionCellProps = {
  treeItem: TreeItem;
  refreshTableCollections: (collectionIds: CollectionId[]) => void;
  refreshMetricCollections: (collectionIds: CollectionId[]) => void;
};

export function ActionCell(props: ActionCellProps) {
  const { treeItem, refreshTableCollections, refreshMetricCollections } = props;
  const { data, children } = treeItem;

  if (isEmptyStateData(data)) {
    return null;
  }

  if (data.model === "table" && "collection_id" in data) {
    return <TableMoreMenu table={data} onMoved={refreshTableCollections} />;
  }

  if (!isCollection(data) || data.model !== "collection") {
    return null;
  }

  const isSnippetCollection = data.namespace === "snippets";

  if (isSnippetCollection && data.id === "root") {
    return <RootSnippetsCollectionMenu collectionId={data.id} />;
  }

  if (isSnippetCollection) {
    return <SnippetCollectionMenu collection={data} />;
  }

  const isLibraryCollection =
    (data.type === "library-data" || data.type === "library-metrics") &&
    !data.is_library_root;

  if (isLibraryCollection) {
    return (
      <LibraryCollectionRowMenu
        childCount={children?.length}
        collection={data}
        refreshMetricCollections={refreshMetricCollections}
        refreshTableCollections={refreshTableCollections}
      />
    );
  }

  return null;
}
