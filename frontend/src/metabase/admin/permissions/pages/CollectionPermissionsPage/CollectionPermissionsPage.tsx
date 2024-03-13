import { useEffect, useCallback } from "react";
import { connect } from "react-redux";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { CollectionPermissionsHelp } from "metabase/admin/permissions/components/CollectionPermissionsHelp";
import Collections from "metabase/entities/collections";
import Groups from "metabase/entities/groups";
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
  LOAD_COLLECTION_PERMISSIONS_FOR_COLLECTION,
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
import { CollectionsApi } from "metabase/services";
import { useAsync } from "react-use";
import { useDispatch, useSelector } from "metabase/lib/redux";

const mapDispatchToProps = {
  initialize: initializeCollectionPermissions,
  loadPermissions: loadCollectionPermissions,
  navigateToItem: ({ id }: { id: CollectionId }) =>
    push(`/admin/permissions/collections/${id}`),
  updateCollectionPermission,
  savePermissions: saveCollectionPermissions,
};

const mapStateToProps = (state: State, props: CollectionIdProps) => {
  return {
    sidebar: getCollectionsSidebar(state, props),
    //permissionEditor: getCollectionsPermissionEditor(state, props),
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
  //permissionEditor: CollectionPermissionEditorType;
  collection: Collection;
  navigateToItem: (item: any) => void;
  updateCollectionPermission: ({
    groupId,
    collection,
    value,
    shouldPropagate,
  }: UpdateCollectionPermissionParams) => void;
  isDirty: boolean;
  savePermissions: () => void;
  loadPermissions: () => void;
  initialize: () => void;
  route: Route;
};

function CollectionsPermissionsPageView({
  sidebar,
  //permissionEditor,
  collection,
  isDirty,
  savePermissions,
  loadPermissions,
  updateCollectionPermission,
  navigateToItem,
  initialize,
  route,
  params,
}: CollectionPermissionsPageProps) {
  // useEffect(() => {
  //   initialize();
  // }, [initialize]);
  const dispatch = useDispatch();

  const permissionEditor = useSelector(state =>
    getCollectionsPermissionEditor(state, { params }),
  );

  console.log(permissionEditor);

  const handlePermissionChange = useCallback(
    (item, _permission, value, toggleState) => {
      updateCollectionPermission({
        groupId: item.id,
        collection,
        value,
        shouldPropagate: toggleState,
      });
    },
    [collection, updateCollectionPermission],
  );

  const { collectionId } = params;

  const { loading } = useAsync(async () => {
    console.log(collectionId);
    if (collectionId) {
      const response = await CollectionsApi.graphForCollection({
        collectionId,
      });
      console.log(response);
      const temp = await dispatch({
        type: LOAD_COLLECTION_PERMISSIONS_FOR_COLLECTION,
        payload: response,
      });
      console.log("dispatched", temp);
    }
  }, [collectionId]);

  useAsync(async () => {
    if (collectionId) {
      const response = await CollectionsApi.graph();
      console.log(response);
    }
  }, [collectionId]);

  return (
    <PermissionsPageLayout
      tab="collections"
      isDirty={isDirty}
      route={route}
      onSave={savePermissions}
      onLoad={() => loadPermissions()}
      helpContent={<CollectionPermissionsHelp />}
    >
      <PermissionsSidebar {...sidebar} onSelect={navigateToItem} />

      {!permissionEditor && (
        <PermissionsEditorEmptyState
          icon="folder"
          message={t`Select a collection to see its permissions`}
        />
      )}

      {permissionEditor && !loading && (
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
