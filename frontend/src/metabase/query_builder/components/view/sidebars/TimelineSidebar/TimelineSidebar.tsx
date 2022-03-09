import React from "react";
import { t } from "ttag";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

export interface TimelineSidebarProps {
  onClose?: () => void;
}

const TimelineSidebar = ({ onClose }: TimelineSidebarProps) => {
  return <SidebarContent title={t`Events`} onClose={onClose} />;
};

export default TimelineSidebar;
