import cx from "classnames";
import { useEffect, useCallback, useState } from "react";
import { connect } from "react-redux";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { CollectionPermissionsHelp } from "metabase/admin/permissions/components/CollectionPermissionsHelp";
import CS from "metabase/css/core/index.css";
import Collections from "metabase/entities/collections";
import Groups from "metabase/entities/groups";
import { Box, Center, Loader } from "metabase/ui";
import type { Collection, CollectionId, GroupId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import PermissionsPageLayout from "../../components/PermissionsPageLayout";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";
import {
  initializeCollectionPermissions,
  updateCollectionPermission,
  saveCollectionPermissions,
  loadCollectionPermissions,
  restoreLoadedCollectionPermissions,
} from "../../permissions";
import type {
  CollectionIdProps,
  CollectionPermissionEditorType,
  CollectionSidebarType,
} from "../../selectors/collection-permissions";
import {
  getCollectionsSidebar,
  getCollectionsPermissionEditor,
  getCollectionEntity,
  getIsDirty,
  collectionsQuery,
} from "../../selectors/collection-permissions";

const mapDispatchToProps = {
  initialize: initializeCollectionPermissions,
  loadPermissions: loadCollectionPermissions,
  restorePermissions: restoreLoadedCollectionPermissions,
  navigateToItem: ({ id }: { id: CollectionId }) =>
    push(`/admin/permissions/collections/${id}`),
  updateCollectionPermission,
  savePermissions: saveCollectionPermissions,
};

const mapStateToProps = (state: State, props: CollectionIdProps) => {
  return {
    sidebar: getCollectionsSidebar(state, props),
    permissionEditor: getCollectionsPermissionEditor(state, props),
    isDirty: getIsDirty(state),
    collection: getCollectionEntity(state, props),
  };
};

type UpdateCollectionPermissionParams = {
  groupId: GroupId;
  collection: Collection;
  value: unknown;
  shouldPropagate: boolean;
};

type CollectionPermissionsPageProps = {
  params: CollectionIdProps["params"];
  sidebar: CollectionSidebarType;
  permissionEditor: CollectionPermissionEditorType;
  collection: Collection | undefined;
  navigateToItem: (item: any) => void;
  updateCollectionPermission: ({
    groupId,
    collection,
    value,
    shouldPropagate,
  }: UpdateCollectionPermissionParams) => void;
  isDirty: boolean;
  savePermissions: () => void;
  loadPermissions: (params: { collectionId: CollectionId }) => Promise<void>;
  restorePermissions: (params: { collectionId: CollectionId }) => Promise<void>;
  initialize: () => Promise<void>;
  route: Route;
};

function CollectionsPermissionsPageView({
  sidebar,
  permissionEditor,
  collection,
  isDirty,
  savePermissions,
  loadPermissions,
  restorePermissions,
  updateCollectionPermission,
  navigateToItem,
  initialize,
  route,
}: CollectionPermissionsPageProps) {
  useEffect(() => {
    initialize();
  }, [initialize]);

  const [{ reqId, error }, setReqInfo] = useState<{
    reqId: number;
    error: unknown;
  }>({ reqId: 0, error: null });
  const isLoading = reqId !== null;
  const isSettled = !isLoading && !error;

  useEffect(() => {
    if (collection?.id) {
      let currReqId;
      setReqInfo(({ reqId }) => {
        currReqId = reqId + 1;
        return { reqId: currReqId, error: null };
      });
      loadPermissions({ collectionId: collection.id })
        .catch(error => {
          setReqInfo(info =>
            info.reqId === currReqId ? { ...info, error } : info,
          );
        })
        .finally(() => {
          setReqInfo(info =>
            info.reqId === currReqId ? { ...info, reqId: null } : info,
          );
        });
    }
  }, [loadPermissions, collection?.id]);

  const handlePermissionChange = useCallback(
    (
      item: { id: GroupId },
      _permission: unknown,
      value: unknown,
      toggleState: boolean,
    ) => {
      if (collection) {
        updateCollectionPermission({
          groupId: item.id,
          collection,
          value,
          shouldPropagate: toggleState,
        });
      }
    },
    [collection, updateCollectionPermission],
  );

  return (
    <PermissionsPageLayout
      tab="collections"
      isDirty={isDirty}
      route={route}
      onSave={savePermissions}
      onLoad={() =>
        collection?.id && restorePermissions({ collectionId: collection?.id })
      }
      helpContent={<CollectionPermissionsHelp />}
    >
      <PermissionsSidebar {...sidebar} onSelect={navigateToItem} />

      {!permissionEditor && isSettled && (
        <PermissionsEditorEmptyState
          icon="folder"
          message={t`Select a collection to see its permissions`}
        />
      )}

      {!permissionEditor && isLoading && (
        <Box w="100%" m="2rem">
          <Center style={{ flexGrow: 1 }}>
            <Loader size="lg" />
          </Center>
        </Box>
      )}

      {!permissionEditor && error && (
        <Box p="2rem">
          <h2 className={cx(CS.textNormal, CS.textLight, CS.ieWrapContentFix)}>
            {error?.data?.message ?? error?.message ?? error.toString()}
          </h2>
        </Box>
      )}

      {permissionEditor && (
        <PermissionsEditor
          isLoading={undefined}
          error={undefined}
          {...permissionEditor}
          onChange={handlePermissionChange}
        />
      )}
    </PermissionsPageLayout>
  );
}

export const CollectionPermissionsPage = _.compose(
  Collections.loadList({
    entityQuery: collectionsQuery,
  }),
  Groups.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionsPermissionsPageView);
