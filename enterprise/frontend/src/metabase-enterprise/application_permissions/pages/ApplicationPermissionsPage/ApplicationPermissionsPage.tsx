import { useCallback, useEffect } from "react";
import { connect } from "react-redux";
import type { Route } from "react-router";
import _ from "underscore";

import { ApplicationPermissionsHelp } from "metabase/admin/permissions/components/ApplicationPermissionsHelp";
import { PermissionsEditor } from "metabase/admin/permissions/components/PermissionsEditor";
import PermissionsPageLayout from "metabase/admin/permissions/components/PermissionsPageLayout";
import Groups from "metabase/entities/groups";
import {
  initializeApplicationPermissions,
  saveApplicationPermissions,
  updateApplicationPermission,
} from "metabase-enterprise/application_permissions/reducer";
import {
  getApplicationPermissionEditor,
  getIsDirty,
} from "metabase-enterprise/application_permissions/selectors";
import type { ApplicationPermissionsState } from "metabase-enterprise/application_permissions/types/state";
import type { GroupId } from "metabase-types/api";

const mapDispatchToProps = {
  initialize: initializeApplicationPermissions,
  updatePermission: updateApplicationPermission,
  savePermissions: saveApplicationPermissions,
};

const mapStateToProps = (state: ApplicationPermissionsState) => {
  return {
    permissionEditor: getApplicationPermissionEditor(state),
    isDirty: getIsDirty(state),
  };
};

type ApplicationPermissionsValue = "yes" | "no";

interface ApplicationPermissionsPageProps {
  isDirty: boolean;
  permissionEditor: any;
  initialize: () => void;
  savePermissions: () => void;
  updatePermission: any;
  route: Route;
}

const ApplicationPermissionsPage = ({
  permissionEditor,
  isDirty,
  initialize,
  savePermissions,
  updatePermission,
  route,
}: ApplicationPermissionsPageProps) => {
  useEffect(() => {
    initialize();
  }, [initialize]);

  const handlePermissionChange = useCallback(
    (item: { id: GroupId }, permission, value: ApplicationPermissionsValue) => {
      updatePermission({
        groupId: item.id,
        permission,
        value,
      });
    },
    [updatePermission],
  );
  return (
    <PermissionsPageLayout
      tab="application"
      isDirty={isDirty}
      route={route}
      helpContent={<ApplicationPermissionsHelp />}
      onSave={savePermissions}
      onLoad={() => initialize()}
    >
      {permissionEditor && (
        <PermissionsEditor
          {...permissionEditor}
          onChange={handlePermissionChange}
        />
      )}
    </PermissionsPageLayout>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Groups.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(ApplicationPermissionsPage);
