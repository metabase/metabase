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
  initializeTenantSpecificCollectionPermissions,
  loadTenantSpecificCollectionPermissions,
  saveTenantSpecificCollectionPermissions,
  updateTenantSpecificCollectionPermission,
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
  getIsTenantSpecificDirty,
  getTenantSpecificCollectionEntity,
  getTenantSpecificCollectionsPermissionEditor,
  getTenantSpecificCollectionsSidebar,
  tenantSpecificCollectionsQuery,
} from "./selectors";

const mapDispatchToProps = {
  initialize: initializeTenantSpecificCollectionPermissions,
  loadPermissions: loadTenantSpecificCollectionPermissions,
  navigateToItem: ({ id }: { id: CollectionId }) =>
    push(`/admin/permissions/tenant-specific-collections/${id}`),
  updateCollectionPermission: updateTenantSpecificCollectionPermission,
  savePermissions: saveTenantSpecificCollectionPermissions,
};

const mapStateToProps = (state: State, props: CollectionIdProps) => {
  return {
    sidebar: getTenantSpecificCollectionsSidebar(state, props),
    permissionEditor: getTenantSpecificCollectionsPermissionEditor(
      state,
      props,
    ),
    isDirty: getIsTenantSpecificDirty(state),
    collection: getTenantSpecificCollectionEntity(state, props),
  };
};

type UpdateCollectionPermissionParams = {
  groupId: GroupId;
  collection: Collection;
  value: unknown;
  shouldPropagate: boolean;
};

type TenantSpecificCollectionPermissionsPageProps = {
  params: CollectionIdProps["params"];
  sidebar: CollectionSidebarType;
  permissionEditor: CollectionPermissionEditorType;
  collection: Collection;
  navigateToItem: (item: { id: CollectionId }) => void;
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

function TenantSpecificCollectionPermissionsPageView({
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
}: TenantSpecificCollectionPermissionsPageProps) {
  useEffect(() => {
    initialize();
  }, [initialize]);

  const handlePermissionChange = useCallback(
    (
      item: { id: GroupId },
      _permission: unknown,
      value: unknown,
      _toggleState: boolean,
    ) => {
      // Always propagate to sub-collections for tenant-specific collections
      updateCollectionPermission({
        groupId: item.id,
        collection,
        value,
        shouldPropagate: true,
      });
    },
    [collection, updateCollectionPermission],
  );

  return (
    <PermissionsPageLayout
      tab="tenant-specific-collections"
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

export const TenantSpecificCollectionPermissionsPage = _.compose(
  Collections.loadList({
    entityQuery: tenantSpecificCollectionsQuery,
  }),
  Groups.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(TenantSpecificCollectionPermissionsPageView);
