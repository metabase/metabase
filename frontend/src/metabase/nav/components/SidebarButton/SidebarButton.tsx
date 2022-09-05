import React from "react";
import { SidebarButtonRoot, SidebarIcon } from "./SidebarButton.styled";

interface SidebarButtonProps {
  isSidebarOpen?: boolean;
  onClick: () => void;
}

function SidebarButton({ isSidebarOpen, onClick }: SidebarButtonProps) {
  return (
    <SidebarButtonRoot onClick={onClick} data-testid="sidebar-toggle">
      <SidebarIcon
        size={28}
        name={isSidebarOpen ? "sidebar_open" : "sidebar_closed"}
      />
    </SidebarButtonRoot>
  );
}

export default SidebarButton;
