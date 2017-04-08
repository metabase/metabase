import { connect } from "react-redux";

import PermissionsEditor from "../components/PermissionsEditor.jsx";

import { getDatabasesPermissionsGrid, getIsDirty, getSaveError, getDiff } from "../selectors";
import { updatePermission, savePermissions, loadPermissions } from "../permissions"

const mapStateToProps = (state, props) => {
    return {
        grid: getDatabasesPermissionsGrid(state, props),
        isDirty: getIsDirty(state, props),
        saveError: getSaveError(state, props),
        diff: getDiff(state, props)
    }
}

const mapDispatchToProps = {
    onUpdatePermission: updatePermission,
    onSave: savePermissions,
    onCancel: loadPermissions,
};

export default connect(mapStateToProps, mapDispatchToProps)(PermissionsEditor);
