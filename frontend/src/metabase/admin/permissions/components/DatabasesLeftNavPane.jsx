import React from "react";

import { LeftNavPane, LeftNavPaneItem, LeftNavPaneItemBack } from "./LeftNavPane.jsx";

export default function DatabasesLeftNavPane({ currentPath, backItemPath, databases }) {
    return (
        <LeftNavPane>
            <LeftNavPaneItemBack path="/admin/permissions/data" />
            {databases && databases.map((database) => {
                 const path = "/admin/permissions/databases/" + database.id;
                 return (
                     <LeftNavPaneItem key={database.id} name={database.name} path={path} selected={currentPath.startsWith(path)} />
                 );
             })}
        </LeftNavPane>
    );
}
