import React from "react";

import { SidebarButtonRoot, SidebarIcon } from "./SidebarButton.styled";

interface SidebarButtonProps {
  isSidebarOpen: boolean;
  onClick: () => void;
}

function SidebarButton({ isSidebarOpen, onClick }: SidebarButtonProps) {
  return (
    <SidebarButtonRoot data-testid="sidebar-toggle-button">
      <SidebarIcon
        size={28}
        name={isSidebarOpen ? "sidebar_open" : "sidebar_closed"}
        onClick={onClick}
      />
    </SidebarButtonRoot>
  );
}

export default SidebarButton;
