import { useCallback, useEffect, useMemo } from "react";
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
import type { CollectionIdProps } from "metabase/admin/permissions/selectors/collection-permissions";
import { Collections } from "metabase/entities/collections";
import { Groups } from "metabase/entities/groups";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { Collection, CollectionId, GroupId } from "metabase-types/api";

import {
  getIsTenantSpecificDirty,
  getTenantSpecificCollectionEntity,
  getTenantSpecificCollectionsPermissionEditor,
  getTenantSpecificCollectionsSidebar,
  tenantSpecificCollectionsQuery,
} from "./selectors";

type UpdateCollectionPermissionParams = {
  groupId: GroupId;
  collection: Collection;
  value: unknown;
  shouldPropagateToChildren: boolean;
};

type TenantSpecificCollectionPermissionsPageProps = {
  params: CollectionIdProps["params"];
  route: Route;
};

function TenantSpecificCollectionPermissionsPageView({
  params,
  route,
}: TenantSpecificCollectionPermissionsPageProps) {
  const dispatch = useDispatch();

  const props = useMemo(() => ({ params }), [params]);
  const sidebar = useSelector((state) =>
    getTenantSpecificCollectionsSidebar(state, props),
  );
  const permissionEditor = useSelector((state) =>
    getTenantSpecificCollectionsPermissionEditor(state, props),
  );
  const isDirty = useSelector(getIsTenantSpecificDirty);
  const collection = useSelector((state) =>
    getTenantSpecificCollectionEntity(state, props),
  );

  const initialize = useCallback(() => {
    dispatch(initializeTenantSpecificCollectionPermissions());
  }, [dispatch]);

  const loadPermissions = useCallback(() => {
    dispatch(loadTenantSpecificCollectionPermissions());
  }, [dispatch]);

  const savePermissions = useCallback(() => {
    dispatch(saveTenantSpecificCollectionPermissions());
  }, [dispatch]);

  const navigateToItem = useCallback(
    ({ id }: { id: CollectionId }) => {
      dispatch(push(`/admin/permissions/tenant-specific-collections/${id}`));
    },
    [dispatch],
  );

  const updateCollectionPermission = useCallback(
    ({
      groupId,
      collection,
      value,
      shouldPropagateToChildren,
    }: UpdateCollectionPermissionParams) => {
      dispatch(
        updateTenantSpecificCollectionPermission({
          groupId,
          collection,
          value,
          shouldPropagateToChildren,
        }),
      );
    },
    [dispatch],
  );

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
      if (!collection) {
        return;
      }
      // Always propagate to sub-collections for tenant-specific collections
      updateCollectionPermission({
        groupId: item.id,
        collection: collection as Collection,
        value,
        shouldPropagateToChildren: true,
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
)(TenantSpecificCollectionPermissionsPageView);
