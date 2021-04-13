import React from "react";

import SidebarLayout from "../components/SidebarLayoutFixedWidth";
import AuditSidebar from "../components/AuditSidebar";

type Props = {
  children: React.Element,
};

const AuditApp = ({ children }: Props) => (
  <SidebarLayout sidebar={<AuditSidebar />}>
    <div>{children}</div>
  </SidebarLayout>
);

export default AuditApp;
