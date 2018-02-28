import { connect } from "react-redux";

import PermissionsEditor from "../components/PermissionsEditor.jsx";

import {
  getTablesPermissionsGrid,
  getIsDirty,
  getSaveError,
  getDiff,
} from "../selectors";
import {
  updatePermission,
  savePermissions,
  loadPermissions,
} from "../permissions";

const mapStateToProps = (state, props) => {
  return {
    grid: getTablesPermissionsGrid(state, props),
    isDirty: getIsDirty(state, props),
    saveError: getSaveError(state, props),
    diff: getDiff(state, props),
  };
};

const mapDispatchToProps = {
  onUpdatePermission: updatePermission,
  onSave: savePermissions,
  onCancel: loadPermissions,
};

export default connect(mapStateToProps, mapDispatchToProps)(PermissionsEditor);
