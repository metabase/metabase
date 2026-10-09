import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import { ForwardRefLink } from "metabase/common/components/Link";
import {
  LibraryTreePage,
  useErrorHandling,
} from "metabase/data-studio/common/components/LibraryTreePage";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  filterTreeByName,
  isCollectionData,
} from "metabase/data-studio/common/utils";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";

import {
  ACTION_COLLECTION_NAMESPACES,
  ACTION_COLLECTION_PICKER_OPTIONS,
} from "../../constants";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useBuildActionTree } from "../../hooks/use-build-action-tree";
import { canCreateActions } from "../../utils";

import { RootDataActionsMenu } from "./RootDataActionsMenu";

export function ActionListPage() {
  const [searchQuery, setSearchQuery] = useState("");
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
  const defaultExpandedIds = useMemo(
    () => tree.slice(0, 1).map((node) => node.id),
    [tree],
  );

  return (
    <LibraryTreePage
      title={t`Data actions`}
      tree={visibleTree}
      isLoading={isLoadingActions || isLoadingDatabases}
      isSearchActive={isSearchActive}
      searchQuery={searchQuery}
      emptyMessage={t`No actions yet`}
      defaultExpandedIds={defaultExpandedIds}
      createMenu={canCreate && <ActionsCreateMenu />}
      renderRowMenu={renderActionRowMenu}
      onSearchQueryChange={setSearchQuery}
    />
  );
}

function renderActionRowMenu({ data }: TreeItem) {
  if (!isCollectionData(data)) {
    return null;
  }
  if (data.id === "root") {
    return <RootDataActionsMenu />;
  }
  return <CollectionRowMenu collection={data} />;
}

function ActionsCreateMenu() {
  const dispatch = useDispatch();

  const handleNewCollectionClick = useCallback(() => {
    dispatch(
      setOpenModalWithProps({
        id: "collection",
        props: {
          initialCollectionId: null,
          namespaces: ACTION_COLLECTION_NAMESPACES,
          pickerOptions: ACTION_COLLECTION_PICKER_OPTIONS,
          showAuthorityLevelPicker: false,
        },
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
