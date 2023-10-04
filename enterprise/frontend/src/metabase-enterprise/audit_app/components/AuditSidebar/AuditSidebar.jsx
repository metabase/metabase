/* eslint-disable react/prop-types */
import { t } from "ttag";
import cx from "classnames";
import { SidebarItemLink, SidebarItemRoot } from "./AuditSidebar.styled";

const AuditSidebarSection = ({ title, children }) => (
  <div className="pb2">
    {title && <AuditSidebarSectionTitle title={title} />}
    {children}
  </div>
);

const AuditSidebarSectionTitle = ({ title }) => (
  <div className="py1 text-smaller text-bold text-uppercase text-medium">
    {title}
  </div>
);

const AuditSidebarItem = ({ title, path }) => (
  <SidebarItemRoot isDisabled={!path}>
    <SidebarItemLink to={path} activeClassName="active">
      {title}
    </SidebarItemLink>
  </SidebarItemRoot>
);

const AuditSidebarContainer = ({ className, style, children }) => (
  <div style={style} className={cx("p4", className)}>
    {children}
  </div>
);

export const AuditSidebar = props => (
  <AuditSidebarContainer {...props}>
    <AuditSidebarSection title={t`People`}>
      <AuditSidebarItem title={t`Team members`} path="/admin/audit/members" />
    </AuditSidebarSection>
    <AuditSidebarSection title={t`Data`}>
      <AuditSidebarItem title={t`Databases`} path="/admin/audit/databases" />
      <AuditSidebarItem title={t`Schemas`} path="/admin/audit/schemas" />
      <AuditSidebarItem title={t`Tables`} path="/admin/audit/tables" />
    </AuditSidebarSection>
    <AuditSidebarSection title={t`Items`}>
      <AuditSidebarItem title={t`Questions`} path="/admin/audit/questions" />
      <AuditSidebarItem title={t`Dashboards`} path="/admin/audit/dashboards" />
      <AuditSidebarItem title={t`Downloads`} path="/admin/audit/downloads" />
      <AuditSidebarItem
        title={t`Subscriptions & Alerts`}
        path="/admin/audit/subscriptions"
      />
    </AuditSidebarSection>
  </AuditSidebarContainer>
);
