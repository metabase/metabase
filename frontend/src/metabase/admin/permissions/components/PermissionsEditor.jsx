import React, { Component, PropTypes } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Confirm from "metabase/components/Confirm.jsx";
import PermissionsGrid from "../components/PermissionsGrid.jsx";
import PermissionsConfirm from "../components/PermissionsConfirm.jsx";
import EditBar from "metabase/components/EditBar.jsx";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";

import cx from "classnames";

const PermissionsEditor = ({ grid, onUpdatePermission, onSave, onCancel, isDirty, saveError, diff }) =>
    <LoadingAndErrorWrapper loading={!grid} className="flex-full flex flex-column">
    { () => // eslint-disable-line react/display-name
        <div className="flex-full flex flex-column">
            { isDirty &&
                <EditBar
                    admin
                    title="You've made changes to permissions."
                    buttons={[
                        <Confirm
                            title="Discard changes?"
                            action={onCancel}
                            content="No changes to permissions will be made."
                        >
                            <button className="Button Button--borderless">
                                Cancel
                            </button>
                        </Confirm>,
                        <Confirm
                            title="Save permissions?"
                            action={onSave}
                            content={<PermissionsConfirm diff={diff} />}
                            triggerClasses={cx({ disabled: !isDirty })}
                        >
                            <button className={cx("Button")}>Save Changes</button>
                        </Confirm>
                    ]}
                />
            }
            <div className="wrapper pt2">
                { grid && grid.crumbs ?
                    <Breadcrumbs className="py1" crumbs={grid.crumbs} />
                :
                    <h2>Permissions</h2>
                }
            </div>
            <PermissionsGrid
                className="flex-full"
                grid={grid}
                onUpdatePermission={onUpdatePermission}
            />
        </div>
    }
    </LoadingAndErrorWrapper>

export default PermissionsEditor;
