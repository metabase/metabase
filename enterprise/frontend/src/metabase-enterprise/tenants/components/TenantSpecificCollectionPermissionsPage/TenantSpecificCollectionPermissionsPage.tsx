import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { CollectionPermissionsHelp } from "metabase/admin/permissions/components/CollectionPermissionsHelp";
import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { PermissionsSidebar } from "metabase/admin/permissions/components/PermissionsSidebar";
import {
  type UpdateTenantCollectionPermissionParams,
  initializeTenantSpecificCollectionPermissions,
  loadTenantSpecificCollectionPermissions,
  saveTenantSpecificCollectionPermissions,
  updateTenantSpecificCollectionPermission,
} from "metabase/admin/permissions/permissions";
import type { PermissionEditorEntity } from "metabase/admin/permissions/types";
import { assertNumericId } from "metabase/admin/permissions/types";
import { useListCollectionsTreeQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { push, useParams } from "metabase/router";
import type { Collection, CollectionId } from "metabase-types/api";

import {
  getIsTenantSpecificDirty,
  getTenantSpecificCollectionEntity,
  getTenantSpecificCollectionsPermissionEditor,
  getTenantSpecificCollectionsSidebar,
  tenantSpecificCollectionsQuery,
} from "./selectors";

function TenantSpecificCollectionPermissionsPageView() {
  const { collectionId } = useParams();
  useListCollectionsTreeQuery(tenantSpecificCollectionsQuery);

  const dispatch = useDispatch();

  const props = useMemo(() => ({ params: { collectionId } }), [collectionId]);
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
    }: UpdateTenantCollectionPermissionParams) => {
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
      item: PermissionEditorEntity,
      _permission: unknown,
      value: unknown,
      _toggleState: boolean | null,
    ) => {
      if (!collection) {
        return;
      }
      // Always propagate to sub-collections for tenant-specific collections
      updateCollectionPermission({
        groupId: assertNumericId(item.id),
        // Unjustified type cast. FIXME
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

export const TenantSpecificCollectionPermissionsPage =
  TenantSpecificCollectionPermissionsPageView;
