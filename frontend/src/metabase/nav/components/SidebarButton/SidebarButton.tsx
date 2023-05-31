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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SidebarButton;
