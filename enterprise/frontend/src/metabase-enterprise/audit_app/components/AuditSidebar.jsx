/* eslint-disable react/prop-types */
import React from "react";

import { IndexLink } from "react-router";
import Link from "metabase/components/Link";
import cx from "classnames";

type Props = {
  className?: string,
  style?: { [key: string]: any },
  children?: React.Element,
};

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
  <div
    className={cx("my2 cursor-pointer text-brand-hover", {
      disabled: !path,
    })}
  >
    {path ? (
      <Link className="no-decoration" activeClassName="text-brand" to={path}>
        {title}
      </Link>
    ) : (
      <IndexLink
        className="no-decoration"
        activeClassName="text-brand"
        to="/admin/audit"
      >
        {title}
      </IndexLink>
    )}
  </div>
);

const AuditSidebar = ({ className, style, children }: Props) => (
  <div style={style} className={cx("p4", className)}>
    {children}
  </div>
);

const AuditAppSidebar = (props: Props) => (
  <AuditSidebar {...props}>
    {/* <AuditSidebarSection>
      <AuditSidebarItem title="Overview" path="/admin/audit/overview" />
    </AuditSidebarSection> */}
    <AuditSidebarSection title="People">
      <AuditSidebarItem title="Team members" path="/admin/audit/members" />
    </AuditSidebarSection>
    <AuditSidebarSection title="Data">
      <AuditSidebarItem title="Databases" path="/admin/audit/databases" />
      <AuditSidebarItem title="Schemas" path="/admin/audit/schemas" />
      <AuditSidebarItem title="Tables" path="/admin/audit/tables" />
    </AuditSidebarSection>
    <AuditSidebarSection title="Items">
      <AuditSidebarItem title="Questions" path="/admin/audit/questions" />
      <AuditSidebarItem title="Dashboards" path="/admin/audit/dashboards" />
      <AuditSidebarItem title="Downloads" path="/admin/audit/downloads" />
    </AuditSidebarSection>
  </AuditSidebar>
);

export default AuditAppSidebar;
