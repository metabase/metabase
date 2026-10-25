import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { PermissionsEditor } from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsEditorEmptyState } from "metabase/admin/permissions/components/PermissionsEditorEmptyState";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import {
  useListCollectionsTreeQuery,
  useListPermissionsGroupsQuery,
} from "metabase/api";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import {
  CollectionPermissionsHelp,
  type PermissionEditorEntity,
  PermissionsSidebar,
  assertNumericId,
  parseCollectionIdParam,
  useCollectionPermissionsGraph,
} from "metabase/permissions";
import { useNavigate, useParams } from "metabase/router";
import type { CollectionId } from "metabase-types/api";

import {
  getTenantSpecificCollectionEntity,
  getTenantSpecificCollectionsPermissionEditor,
  getTenantSpecificCollectionsSidebar,
  tenantSpecificCollectionsQuery,
} from "./utils";

export function TenantSpecificCollectionPermissionsPage() {
  const navigate = useNavigate();
  const params = useParams<{ collectionId: string }>();
  const collectionId = parseCollectionIdParam(params.collectionId);
  const { data: collections } = useListCollectionsTreeQuery(
    tenantSpecificCollectionsQuery,
  );
  const { data: groups } = useListPermissionsGroupsQuery({});
  const {
    permissions,
    isDirty,
    saveError,
    updateCollectionPermission,
    savePermissions,
    resetPermissions,
    clearSaveError,
  } = useCollectionPermissionsGraph(tenantSpecificCollectionsQuery.namespace);

  const sidebar = useMemo(
    () => getTenantSpecificCollectionsSidebar(collectionId),
    [collectionId],
  );
  const collection = useMemo(
    () =>
      collections && collectionId != null
        ? getTenantSpecificCollectionEntity(collections, collectionId)
        : undefined,
    [collections, collectionId],
  );
  const permissionEditor = useMemo(
    () =>
      permissions && collection && groups
        ? getTenantSpecificCollectionsPermissionEditor({
            permissions,
            collection,
            groups,
          })
        : null,
    [permissions, collection, groups],
  );

  const navigateToItem = ({ id }: { id: CollectionId }) =>
    navigate(`${getPermissionsBasePath()}/tenant-specific-collections/${id}`);

  const handlePermissionChange = useCallback(
    (item: PermissionEditorEntity, _permission: unknown, value: unknown) => {
      if (!collection) {
        return;
      }
      updateCollectionPermission({
        groupId: assertNumericId(item.id),
        collection,
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
      onCancel={resetPermissions}
      saveError={saveError}
      onClearSaveError={clearSaveError}
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
          key={collection?.id}
          isLoading={undefined}
          error={undefined}
          {...permissionEditor}
          onChange={handlePermissionChange}
        />
      )}
    </PermissionsPageLayout>
  );
}
