import React from "react";
import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import { APP_BAR_HEIGHT } from "../constants";

export const AppBarRoot = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: ${APP_BAR_HEIGHT};
  background-color: ${color("bg-white")};
  border-bottom: 1px solid ${color("border")};
  z-index: 4;
`;

export const LogoIconWrapper = styled.div`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  padding: ${space(1)};
  margin-left: ${space(1)};

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

const SidebarIcon = styled(Icon)`
  &:hover {
    cursor: pointer;
    color: ${color("brand")};
  }
`;

const SidebarButtonRoot = styled.div`
  margin-left: ${space(1)};
  margin-top: ${space(1)};
`;

interface SidebarButtonProps {
  isSidebarOpen: boolean;
  onClick: func;
}

export function SidebarButton({ isSidebarOpen, onClick }: SidebarButtonProps) {
  return (
    <SidebarButtonRoot>
      <SidebarIcon
        size={28}
        name={isSidebarOpen ? "sidebar_open" : "sidebar_closed"}
        onClick={onClick}
      />
    </SidebarButtonRoot>
  );
}
