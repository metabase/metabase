/* eslint-disable react/prop-types */
import React from "react";

import SidebarLayout from "../components/SidebarLayoutFixedWidth";
import AuditSidebar from "../components/AuditSidebar";

const AuditApp = ({ children }) => (
  <SidebarLayout sidebar={<AuditSidebar />}>
    <div>{children}</div>
  </SidebarLayout>
);

export default AuditApp;
