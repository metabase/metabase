import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { canUserCreateNativeQueries } from "metabase/current-user";
import { LibraryTreePage } from "metabase/data-studio/common/components/LibraryTreePage";
import { useErrorHandling } from "metabase/data-studio/common/hooks/use-error-handling";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  filterTreeByName,
  isCollectionData,
  openNewCollectionModal,
} from "metabase/data-studio/common/utils";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useBuildSnippetTree } from "../../hooks/use-build-snippet-tree";

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
  const [collectionModal, setCollectionModal] =
    useState<CollectionRowModalState>();
  const { tree, rootCollection, isLoading, error } = useBuildSnippetTree();
  useErrorHandling(error);

  const isSearchActive = searchQuery.trim().length > 0;
  const visibleTree = useMemo(
    () => (isSearchActive ? filterTreeByName(tree, searchQuery) : tree),
    [isSearchActive, tree, searchQuery],
  );
  const renderRowMenu = useCallback(
    (item: TreeItem) => (
      <SnippetRowMenu item={item} onOpenModal={setCollectionModal} />
    ),
    [],
  );

  return (
    <LibraryTreePage
      title={t`SQL snippets`}
      tree={visibleTree}
      isLoading={isLoading}
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={t`No snippets yet`}
      createMenu={<SnippetsCreateMenu />}
      pageMenu={{
        label: t`Snippet options`,
        actions: [
          {
            label: t`View archived snippets`,
            icon: "view_archive",
            to: Urls.dataStudioArchivedSnippets(),
          },
        ],
        permissionsCollection: PLUGIN_SNIPPET_FOLDERS.isEnabled
          ? rootCollection
          : undefined,
        onOpenModal: setCollectionModal,
      }}
      renderRowMenu={renderRowMenu}
      onSearchQueryChange={setSearchQuery}
    >
      <CollectionRowModal
        modal={collectionModal}
        onClose={() => setCollectionModal(undefined)}
      />
    </LibraryTreePage>
  );
}

type SnippetRowMenuProps = {
  item: TreeItem;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

function SnippetRowMenu({ item: { data }, onOpenModal }: SnippetRowMenuProps) {
  if (!isCollectionData(data)) {
    return null;
  }
  return <CollectionRowMenu collection={data} onOpenModal={onOpenModal} />;
}

function SnippetsCreateMenu() {
  const dispatch = useDispatch();
  const canCreateSnippets = useSelector(canUserCreateNativeQueries);
  const canCreateFolders =
    canCreateSnippets && PLUGIN_SNIPPET_FOLDERS.isEnabled;

  const handleNewFolderClick = useCallback(() => {
    dispatch(
      openNewCollectionModal({
        initialCollectionId: null,
        namespaces: ["snippets"],
        pickerOptions: SNIPPET_COLLECTION_PICKER_OPTIONS,
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
