import _ from "underscore";
import { Route } from "react-router";
import React, { useCallback, useEffect } from "react";
import { connect } from "react-redux";

import { PermissionsEditor } from "metabase/admin/permissions/components/PermissionsEditor";

import Groups from "metabase/entities/groups";
import {
  getGeneralPermissionEditor,
  getIsDirty,
} from "metabase-enterprise/general_permissions/selectors";

import PermissionsPageLayout from "metabase/admin/permissions/components/PermissionsPageLayout";
import {
  initializeGeneralPermissions,
  saveGeneralPermissions,
  updateGeneralPermission,
} from "metabase-enterprise/general_permissions/reducer";
import { GeneralPermissionsState } from "metabase-enterprise/general_permissions/types/state";

const mapDispatchToProps = {
  initialize: initializeGeneralPermissions,
  updatePermission: updateGeneralPermission,
  savePermissions: saveGeneralPermissions,
};

const mapStateToProps = (state: GeneralPermissionsState) => {
  return {
    permissionEditor: getGeneralPermissionEditor(state),
    isDirty: getIsDirty(state),
  };
};

interface GeneralPermissionsPageProps {
  isDirty: boolean;
  permissionEditor: any;
  initialize: () => void;
  savePermissions: () => void;
  updatePermission: any;
  route: Route;
}

const GeneralPermissionsPage = ({
  permissionEditor,
  isDirty,
  initialize,
  savePermissions,
  updatePermission,
  route,
}: GeneralPermissionsPageProps) => {
  useEffect(() => {
    initialize();
  }, [initialize]);

  const handlePermissionChange = useCallback(
    (item, permission, value) => {
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
      tab="general"
      isDirty={isDirty}
      route={route}
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

export default _.compose(
  Groups.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(GeneralPermissionsPage);
