import React from "react";

import { LeftNavPane, LeftNavPaneItem } from "./LeftNavPane.jsx"

function TopLevelLeftNavPane({ currentPath }) {
    currentPath = currentPath || "";
    return (
        <LeftNavPane>
            <LeftNavPaneItem name="Groups" path="/admin/permissions/groups" selected={currentPath.startsWith("/admin/permissions/groups")} />
            <LeftNavPaneItem name="Data" path="/admin/permissions/data" selected={currentPath.startsWith("/admin/permissions/data")} />
        </LeftNavPane>
    );
}

export default TopLevelLeftNavPane;
