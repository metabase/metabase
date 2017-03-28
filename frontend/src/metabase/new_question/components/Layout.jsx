import cxs from "cxs";
import React from "react";

export const Sidebar = ({ children }) => (
    <div className={cxs({ flex: "0 0 328px", marginLeft: "4em" })}>
        {children}
    </div>
);
