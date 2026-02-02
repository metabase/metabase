import { useCallback, useEffect } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { CollectionPermissionsHelp } from "metabase/admin/permissions/components/CollectionPermissionsHelp";
import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { PermissionsSidebar } from "metabase/admin/permissions/components/PermissionsSidebar";
import {
  initializeTenantCollectionPermissions,
  loadTenantCollectionPermissions,
  saveTenantCollectionPermissions,
  updateTenantCollectionPermission,
} from "metabase/admin/permissions/permissions";
import type {
  CollectionIdProps,
  CollectionPermissionEditorType,
  CollectionSidebarType,
} from "metabase/admin/permissions/selectors/collection-permissions";
import { Collections } from "metabase/entities/collections";
import { Groups } from "metabase/entities/groups";
import { connect } from "metabase/lib/redux";
import type { Collection, CollectionId, GroupId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  getIsTenantDirty,
  getTenantCollectionEntity,
  getTenantCollectionsPermissionEditor,
  getTenantCollectionsSidebar,
  tenantCollectionsQuery,
} from "./selectors";

const mapDispatchToProps = {
  initialize: initializeTenantCollectionPermissions,
  loadPermissions: loadTenantCollectionPermissions,
  navigateToItem: ({ id }: { id: CollectionId }) =>
    push(`/admin/permissions/tenant-collections/${id}`),
  updateCollectionPermission: updateTenantCollectionPermission,
  savePermissions: saveTenantCollectionPermissions,
};

const mapStateToProps = (state: State, props: CollectionIdProps) => {
  return {
    sidebar: getTenantCollectionsSidebar(state, props),
    permissionEditor: getTenantCollectionsPermissionEditor(state, props),
    isDirty: getIsTenantDirty(state),
    collection: getTenantCollectionEntity(state, props),
  };
};

type UpdateCollectionPermissionParams = {
  groupId: GroupId;
  collection: Collection;
  value: unknown;
  shouldPropagateToChildren: boolean;
};

type TenantCollectionPermissionsPageProps = {
  params: CollectionIdProps["params"];
  sidebar: CollectionSidebarType;
  permissionEditor: CollectionPermissionEditorType;
  collection: Collection;
  navigateToItem: (item: { id: CollectionId }) => void;
  updateCollectionPermission: ({
    groupId,
    collection,
    value,
    shouldPropagateToChildren,
  }: UpdateCollectionPermissionParams) => void;
  isDirty: boolean;
  savePermissions: () => void;
  loadPermissions: () => void;
  initialize: () => void;
  route: Route;
};

function TenantCollectionPermissionsPageView({
  sidebar,
  permissionEditor,
  collection,
  isDirty,
  savePermissions,
  loadPermissions,
  updateCollectionPermission,
  navigateToItem,
  initialize,
  route,
}: TenantCollectionPermissionsPageProps) {
  useEffect(() => {
    initialize();
  }, [initialize]);

  const handlePermissionChange = useCallback(
    (
      item: { id: GroupId },
      _permission: unknown,
      value: unknown,
      toggleState: boolean,
    ) => {
      updateCollectionPermission({
        groupId: item.id,
        collection,
        value,
        shouldPropagateToChildren: toggleState,
      });
    },
    [collection, updateCollectionPermission],
  );

  return (
    <PermissionsPageLayout
      tab="tenant-collections"
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

export const TenantCollectionPermissionsPage = _.compose(
  Collections.loadList({
    entityQuery: tenantCollectionsQuery,
  }),
  Groups.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(TenantCollectionPermissionsPageView);
