import { useCallback, useMemo } from "react";

import { PermissionsEditor } from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { useListPermissionsGroupsQuery } from "metabase/api";
import {
  ApplicationPermissionsHelp,
  type PermissionEditorEntity,
  assertNumericId,
} from "metabase/permissions";
import type { DataPermissionValue } from "metabase-types/api";

import { useApplicationPermissionsGraph } from "../../hooks/use-application-permissions-graph";

import {
  type ApplicationPermissionSection,
  getApplicationPermissionEditor,
  toApplicationPermissionValue,
} from "./utils";

export function ApplicationPermissionsPage() {
  const { data: groups } = useListPermissionsGroupsQuery({});
  const {
    permissions,
    isDirty,
    isFetching,
    saveError,
    updateApplicationPermission,
    savePermissions,
    resetPermissions,
    clearSaveError,
  } = useApplicationPermissionsGraph();

  const permissionEditor = useMemo(
    () =>
      permissions && groups
        ? getApplicationPermissionEditor(permissions, groups)
        : null,
    [permissions, groups],
  );

  const handlePermissionChange = useCallback(
    (
      item: PermissionEditorEntity<ApplicationPermissionSection>,
      section: ApplicationPermissionSection,
      value: DataPermissionValue,
    ) => {
      updateApplicationPermission({
        groupId: assertNumericId(item.id),
        permission: section.permission,
        value: toApplicationPermissionValue(value),
      });
    },
    [updateApplicationPermission],
  );

  return (
    <PermissionsPageLayout
      tab="application"
      isDirty={isDirty}
      helpContent={<ApplicationPermissionsHelp />}
      onSave={savePermissions}
      onCancel={resetPermissions}
      saveError={saveError}
      onClearSaveError={clearSaveError}
    >
      {permissionEditor && (
        <PermissionsEditor
          {...permissionEditor}
          isLoading={isFetching}
          onChange={handlePermissionChange}
        />
      )}
    </PermissionsPageLayout>
  );
}
