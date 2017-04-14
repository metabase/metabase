import cxs from "cxs";
import React from "react";

export const Sidebar = ({ children }) => (
    <div className={cxs({ flex: "0 0 328px" })}>
        {children}
    </div>
);
