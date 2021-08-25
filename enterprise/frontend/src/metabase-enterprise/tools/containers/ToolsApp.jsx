import React from "react";

// some shit...
import SidebarLayout from "../components/SidebarLayoutFixedWidth";
import ToolsSidebar from "../components/AuditSidebar";

type Props = {
  children: React.Element,
};

const ToolsApp = ({ children }: Props) => (
  <SidebarLayout sidebar={<ToolsSidebar />}>
    <div>{children}</div>
  </SidebarLayout>
);

export default ToolsApp;
