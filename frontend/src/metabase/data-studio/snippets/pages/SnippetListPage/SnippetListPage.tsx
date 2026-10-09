import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import { ForwardRefLink } from "metabase/common/components/Link";
import { canUserCreateNativeQueries } from "metabase/current-user";
import {
  LibraryTreePage,
  useErrorHandling,
} from "metabase/data-studio/common/components/LibraryTreePage";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  filterTreeByName,
  isCollectionData,
} from "metabase/data-studio/common/utils";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useBuildSnippetTree } from "../../hooks/use-build-snippet-tree";

import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";

const SNIPPET_COLLECTION_PICKER_OPTIONS = {
  hasLibrary: false,
  hasRootCollection: true,
  hasPersonalCollections: false,
  hasRecents: false,
  hasSearch: false,
  hasConfirmButtons: true,
  canCreateCollections: false,
};

export function SnippetListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { tree, isLoading, error } = useBuildSnippetTree();
  useErrorHandling(error);

  const isSearchActive = searchQuery.trim().length > 0;
  const visibleTree = useMemo(
    () => (isSearchActive ? filterTreeByName(tree, searchQuery) : tree),
    [isSearchActive, tree, searchQuery],
  );
  const defaultExpandedIds = useMemo(
    () => tree.slice(0, 1).map((node) => node.id),
    [tree],
  );

  return (
    <LibraryTreePage
      title={t`SQL snippets`}
      tree={visibleTree}
      isLoading={isLoading}
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={t`No snippets yet`}
      defaultExpandedIds={defaultExpandedIds}
      createMenu={<SnippetsCreateMenu />}
      renderRowMenu={renderSnippetRowMenu}
      onSearchQueryChange={setSearchQuery}
    />
  );
}

function renderSnippetRowMenu({ data }: TreeItem) {
  if (!isCollectionData(data)) {
    return null;
  }
  if (data.id === "root") {
    return <RootSnippetsCollectionMenu collectionId={data.id} />;
  }
  return <CollectionRowMenu collection={data} />;
}

function SnippetsCreateMenu() {
  const dispatch = useDispatch();
  const canCreateSnippets = useSelector(canUserCreateNativeQueries);
  const canCreateFolders =
    canCreateSnippets && PLUGIN_SNIPPET_FOLDERS.isEnabled;

  const handleNewFolderClick = useCallback(() => {
    dispatch(
      setOpenModalWithProps({
        id: "collection",
        props: {
          initialCollectionId: null,
          namespaces: ["snippets"],
          pickerOptions: SNIPPET_COLLECTION_PICKER_OPTIONS,
          showAuthorityLevelPicker: false,
        },
      }),
    );
  }, [dispatch]);

  if (!canCreateSnippets) {
    return null;
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="lg" leftSection={<Icon name="add" />}>{t`New`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={ForwardRefLink}
          to={Urls.newDataStudioSnippet()}
          leftSection={<FixedSizeIcon name="snippet" />}
          aria-label={t`Create new snippet`}
        >
          {t`Snippet`}
        </Menu.Item>
        {canCreateFolders && (
          <Menu.Item
            leftSection={<FixedSizeIcon name="folder" />}
            onClick={handleNewFolderClick}
          >
            {t`Folder`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
