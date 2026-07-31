import { useCallback, useEffect } from "react";
import { t } from "ttag";

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
import type { PermissionEditorEntity } from "metabase/admin/permissions/types";
import { assertNumericId } from "metabase/admin/permissions/types";
import { useListCollectionsTreeQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { push, useParams } from "metabase/router";
import type { CollectionId } from "metabase-types/api";

import {
  getIsTenantDirty,
  getTenantCollectionEntity,
  getTenantCollectionsPermissionEditor,
  getTenantCollectionsSidebar,
  tenantCollectionsQuery,
} from "./selectors";

export function TenantCollectionPermissionsPage() {
  const dispatch = useDispatch();
  useListCollectionsTreeQuery(tenantCollectionsQuery);

  // These selectors resolve the selected collection from the route, so they
  // take the route params rather than reading them from the store.
  const params = useParams<{ collectionId: string }>();
  const selectorProps = { params };
  const sidebar = useSelector((state) =>
    getTenantCollectionsSidebar(state, selectorProps),
  );
  const permissionEditor = useSelector((state) =>
    getTenantCollectionsPermissionEditor(state, selectorProps),
  );
  const collection = useSelector((state) =>
    getTenantCollectionEntity(state, selectorProps),
  );
  const isDirty = useSelector(getIsTenantDirty);

  useEffect(() => {
    dispatch(initializeTenantCollectionPermissions());
  }, [dispatch]);

  const navigateToItem = ({ id }: { id: CollectionId }) =>
    dispatch(push(`/admin/permissions/tenant-collections/${id}`));

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
      dispatch(
        updateTenantCollectionPermission({
          groupId: assertNumericId(item.id),
          collection,
          value,
          shouldPropagateToChildren: toggleState ?? false,
        }),
      );
    },
    [collection, dispatch],
  );

  return (
    <PermissionsPageLayout
      tab="tenant-collections"
      isDirty={isDirty}
      onSave={() => dispatch(saveTenantCollectionPermissions())}
      onLoad={() => dispatch(loadTenantCollectionPermissions())}
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
