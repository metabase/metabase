/* eslint-disable react/prop-types */
import fitViewport from "metabase/hoc/FitViewPort";

import AuditSidebar from "../components/AuditSidebar";
import SidebarLayout from "../components/SidebarLayoutFixedWidth";

const Layout = fitViewport(SidebarLayout);

const AuditApp = ({ children }) => (
  <Layout sidebar={<AuditSidebar />}>
    <div>{children}</div>
  </Layout>
);

export default AuditApp;
