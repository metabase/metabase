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
  type UpdateTenantCollectionPermissionParams,
  initializeTenantCollectionPermissions,
  loadTenantCollectionPermissions,
  saveTenantCollectionPermissions,
  updateTenantCollectionPermission,
} from "metabase/admin/permissions/permissions";
import type {
  CollectionIdProps,
  CollectionSidebarType,
} from "metabase/admin/permissions/selectors/collection-permissions";
import type {
  PermissionEditorEntity,
  PermissionEditorType,
} from "metabase/admin/permissions/types";
import { assertNumericId } from "metabase/admin/permissions/types";
import { useListCollectionsTreeQuery } from "metabase/api";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type { Collection, CollectionId } from "metabase-types/api";

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

type TenantCollectionPermissionsPageProps = {
  params: CollectionIdProps["params"];
  sidebar: CollectionSidebarType;
  permissionEditor: PermissionEditorType | null;
  collection: Collection | null;
  navigateToItem: (item: { id: CollectionId }) => any;
  updateCollectionPermission: (
    params: UpdateTenantCollectionPermissionParams,
  ) => any;
  isDirty: boolean;
  savePermissions: (...args: any[]) => any;
  loadPermissions: (...args: any[]) => any;
  initialize: (...args: any[]) => any;
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
  useListCollectionsTreeQuery(tenantCollectionsQuery);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handlePermissionChange = useCallback(
    (
      item: PermissionEditorEntity,
      _permission: unknown,
      value: unknown,
      toggleState: boolean | null,
    ) => {
      if (!collection) {
        return;
      }
      updateCollectionPermission({
        groupId: assertNumericId(item.id),
        collection,
        value,
        shouldPropagateToChildren: toggleState ?? false,
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
  connect(mapStateToProps, mapDispatchToProps),
)(TenantCollectionPermissionsPageView);
