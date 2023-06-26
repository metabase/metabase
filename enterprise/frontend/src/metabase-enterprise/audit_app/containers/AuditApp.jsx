/* eslint-disable react/prop-types */
import fitViewport from "metabase/hoc/FitViewPort";

import SidebarLayout from "../components/SidebarLayoutFixedWidth";
import AuditSidebar from "../components/AuditSidebar";

const Layout = fitViewport(SidebarLayout);

const AuditApp = ({ children }) => (
  <Layout sidebar={<AuditSidebar />}>
    <div>{children}</div>
  </Layout>
);

export default AuditApp;
