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

import {
  type LibrarySection,
  getItemSection,
} from "../hooks/library-bulk-selection.utils";

import { LibraryCollectionRowMenu } from "./LibraryCollectionRowMenu";
import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";

type ActionCellProps = {
  treeItem: TreeItem;
  refreshSection: (
    section: LibrarySection,
    collectionIds: CollectionId[],
  ) => void;
};

export function ActionCell({ treeItem, refreshSection }: ActionCellProps) {
  const { data, children } = treeItem;

  if (isEmptyStateData(data)) {
    return null;
  }

  if (isTableData(data)) {
    return (
      <TableMoreMenu
        table={data}
        onMoved={(collectionIds) => refreshSection("data", collectionIds)}
      />
    );
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
      />
    );
  }

  return null;
}
