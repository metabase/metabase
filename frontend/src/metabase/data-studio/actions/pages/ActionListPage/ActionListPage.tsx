import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LibraryTreePage } from "metabase/data-studio/common/components/LibraryTreePage";
import { useErrorHandling } from "metabase/data-studio/common/hooks/use-error-handling";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  filterTreeByName,
  isCollectionData,
  openNewCollectionModal,
} from "metabase/data-studio/common/utils";
import { PLUGIN_LIBRARY, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";

import {
  ACTION_COLLECTION_NAMESPACES,
  ACTION_COLLECTION_PICKER_OPTIONS,
} from "../../constants";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useBuildActionTree } from "../../hooks/use-build-action-tree";
import { canCreateActions } from "../../utils";

export function ActionListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionModal, setCollectionModal] =
    useState<CollectionRowModalState>();
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const {
    databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useActionDatabases();
  const canCreate = canCreateActions(databases);
  const {
    tree,
    rootCollection,
    isLoading: isLoadingActions,
    error: actionsError,
  } = useBuildActionTree({
    canCreateActions: !isRemoteSyncReadOnly && canCreate,
  });
  useErrorHandling(actionsError ?? databasesError);

  const isSearchActive = searchQuery.trim().length > 0;
  const visibleTree = useMemo(
    () => (isSearchActive ? filterTreeByName(tree, searchQuery) : tree),
    [isSearchActive, tree, searchQuery],
  );
  const renderRowMenu = useCallback(
    (item: TreeItem) => (
      <ActionRowMenu item={item} onOpenModal={setCollectionModal} />
    ),
    [],
  );

  return (
    <LibraryTreePage
      title={t`Data actions`}
      tree={visibleTree}
      isLoading={isLoadingActions || isLoadingDatabases}
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={t`No actions yet`}
      createMenu={canCreate && <ActionsCreateMenu />}
      pageMenu={{
        label: t`Data action options`,
        actions: [
          {
            label: t`View archived actions`,
            icon: "view_archive",
            to: Urls.dataStudioArchivedActions(),
          },
        ],
        permissionsCollection: PLUGIN_LIBRARY.isEnabled
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

type ActionRowMenuProps = {
  item: TreeItem;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

function ActionRowMenu({ item: { data }, onOpenModal }: ActionRowMenuProps) {
  if (!isCollectionData(data)) {
    return null;
  }
  return <CollectionRowMenu collection={data} onOpenModal={onOpenModal} />;
}

function ActionsCreateMenu() {
  const dispatch = useDispatch();

  const handleNewCollectionClick = useCallback(() => {
    dispatch(
      openNewCollectionModal({
        initialCollectionId: null,
        namespaces: ACTION_COLLECTION_NAMESPACES,
        pickerOptions: ACTION_COLLECTION_PICKER_OPTIONS,
      }),
    );
  }, [dispatch]);

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="lg" leftSection={<Icon name="add" />}>{t`New`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={ForwardRefLink}
          to={Urls.newDataStudioAction()}
          leftSection={<FixedSizeIcon name="bolt" />}
        >
          {t`Action`}
        </Menu.Item>
        <Menu.Item
          leftSection={<FixedSizeIcon name="folder" />}
          onClick={handleNewCollectionClick}
        >
          {t`Collection`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
