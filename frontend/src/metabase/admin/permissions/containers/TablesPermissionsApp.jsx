import { connect } from "react-redux";
import { push } from "react-router-redux";

import PermissionsEditor from "../components/PermissionsEditor";

import { getTablesPermissionsGrid, getIsDirty, getDiff } from "../selectors";
import {
  updatePermission,
  savePermissions,
  loadPermissions,
} from "../permissions";

const mapStateToProps = (state, props) => {
  return {
    grid: getTablesPermissionsGrid(state, props),
    isDirty: getIsDirty(state, props),
    diff: getDiff(state, props),
    tab: "databases",
  };
};

const mapDispatchToProps = {
  onUpdatePermission: updatePermission,
  onSave: savePermissions,
  onCancel: loadPermissions,
  onChangeTab: tab => push(`/admin/permissions/${tab}`),
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(PermissionsEditor);
