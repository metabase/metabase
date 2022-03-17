import _ from "underscore";
import { Route } from "react-router";
import React, { useEffect } from "react";
import { connect } from "react-redux";

import { PermissionsEditor } from "metabase/admin/permissions/components/PermissionsEditor";

import Groups from "metabase/entities/groups";
import { State } from "metabase-types/store";
import {
  getGeneralPermissionEditor,
  getIsDirty,
} from "metabase-enterprise/general_permissions/selectors";
import {
  initializeGeneralPermissions,
  saveGeneralPermissions,
} from "metabase/admin/permissions/permissions";
import PermissionsPageLayout from "metabase/admin/permissions/components/PermissionsPageLayout";

const mapDispatchToProps = {
  initialize: initializeGeneralPermissions,
  savePermissions: saveGeneralPermissions,
};

const mapStateToProps = (state: State) => {
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
  route: Route;
}

const GeneralPermissionsPage = ({
  permissionEditor,
  isDirty,
  initialize,
  savePermissions,
  route,
}: GeneralPermissionsPageProps) => {
  useEffect(() => {
    initialize();
  }, [initialize]);

  const handlePermissionChange = () => {
    return null;
  };
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
