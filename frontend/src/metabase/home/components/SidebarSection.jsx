import React from "react";

import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

const SidebarSection = ({ title, icon, extra, children }) => (
  <div className="px2 pt1">
    <div className="text-dark-grey clearfix pt2 pb2">
      <Icon className="float-left" name={icon} size={18} />
      <span className="pl1 Sidebar-header">{title}</span>
      {extra && <span className="float-right">{extra}</span>}
    </div>
    <div
      className="rounded bg-white"
      style={{ border: `1px solid ${color("border")}` }}
    >
      {children}
    </div>
  </div>
);

export default SidebarSection;
