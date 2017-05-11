import React from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Confirm from "metabase/components/Confirm.jsx";
import Modal from "metabase/components/Modal.jsx";
import PermissionsGrid from "../components/PermissionsGrid.jsx";
import PermissionsConfirm from "../components/PermissionsConfirm.jsx";
import EditBar from "metabase/components/EditBar.jsx";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import Button from "metabase/components/Button";

import cx from "classnames";

import _ from "underscore";

const PermissionsEditor = ({ title = "Permissions", modal, admin, grid, onUpdatePermission, onSave, onCancel, confirmCancel, isDirty, saveError, diff, location }) => {
    const saveButton =
        <Confirm
            title="Save permissions?"
            action={onSave}
            content={<PermissionsConfirm diff={diff} />}
            triggerClasses={cx({ disabled: !isDirty })}
            key="save"
        >
            <Button primary small={!modal}>Save Changes</Button>
        </Confirm>;

    const cancelButton = confirmCancel ?
        <Confirm
            title="Discard changes?"
            action={onCancel}
            content="No changes to permissions will be made."
            key="discard"
        >
            <Button small={!modal}>Cancel</Button>
        </Confirm>
    :
        <Button small={!modal} onClick={onCancel} key="cancel">Cancel</Button>;

    return (
        <LoadingAndErrorWrapper loading={!grid} className="flex-full flex flex-column">
        { () => // eslint-disable-line react/display-name
        modal ?
            <Modal inline title={title} footer={[cancelButton, saveButton]} onClose={onCancel}>
                <PermissionsGrid
                    className="flex-full"
                    grid={grid}
                    onUpdatePermission={onUpdatePermission}
                    {...getEntityAndGroupIdFromLocation(location)}
                />
            </Modal>
        :
            <div className="flex-full flex flex-column">
                { isDirty &&
                    <EditBar
                        admin={admin}
                        title="You've made changes to permissions."
                        buttons={[cancelButton, saveButton]}
                    />
                }
                <div className="wrapper pt2">
                    { grid && grid.crumbs ?
                        <Breadcrumbs className="py1" crumbs={grid.crumbs} />
                    :
                        <h2>{title}</h2>
                    }
                </div>
                <PermissionsGrid
                    className="flex-full"
                    grid={grid}
                    onUpdatePermission={onUpdatePermission}
                    {...getEntityAndGroupIdFromLocation(location)}
                />
            </div>
        }
        </LoadingAndErrorWrapper>
    )
}

PermissionsEditor.defaultProps = {
    admin: true
}

function getEntityAndGroupIdFromLocation({ query = {}} = {}) {
    query = _.mapObject(query, (value) => isNaN(value) ? value : parseFloat(value));
    const entityId = _.omit(query, "groupId");
    const groupId = query.groupId;
    return {
        groupId: groupId || null,
        entityId: Object.keys(entityId).length > 0 ? entityId : null
    };
}

export default PermissionsEditor;
