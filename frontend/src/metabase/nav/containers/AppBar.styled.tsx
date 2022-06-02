import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

import { color } from "metabase/lib/colors";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";

import { APP_BAR_HEIGHT } from "../constants";

export const AppBarRoot = styled.header`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: ${APP_BAR_HEIGHT};
  background-color: ${color("bg-white")};
  border-bottom: 1px solid ${color("border")};
  z-index: 4;

  @media print {
    display: none;
  }
`;

export const LogoLink = styled(Link)`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  left: 0;
  padding: ${space(1)};
  padding-left: ${space(2)};
  margin-left: ${space(2)};
  position: absolute;
  transition: opacity 0.3s;

  &:hover {
    background-color: ${color("bg-light")};
  }

  ${breakpointMaxSmall} {
    margin-left: ${space(1)};
  }
`;

export const SidebarButtonContainer = styled.div`
  left: 23px;
  opacity: 0;
  position: absolute;
  top: 4px;
  transition: opacity 0.3s;

  ${breakpointMaxSmall} {
    left: 5px;
  }
`;

export interface LeftContainerProps {
  isSearchActive: boolean;
}

export const LeftContainer = styled.div<LeftContainerProps>`
  display: flex;
  height: 100%;
  flex-direction: row;
  align-items: center;
  width: 30%;

  &:hover {
    ${LogoLink} {
      opacity: 0;
      pointer-events: none;
    }

    ${SidebarButtonContainer} {
      opacity: 1;
    }
  }

  ${breakpointMaxSmall} {
    width: ${props => (props.isSearchActive ? "80px" : "calc(100% - 60px);")};

    ${LogoLink} {
      opacity: 0;
      pointer-events: none;
    }

    ${SidebarButtonContainer} {
      opacity: 1;
    }
  }
`;

export const MiddleContainer = styled.div`
  display: none;
  justify-content: center;
  width: 80px;

  ${breakpointMaxSmall} {
    display: flex;
  }

  ${LogoLink} {
    position: relative;
    padding-left: 8px;
    margin-left: 0;
  }
`;

export const RightContainer = styled.div`
  display: flex;
  height: 100%;
  flex-direction: row;
  align-items: center;
  width: 30%;
  justify-content: flex-end;

  ${breakpointMaxSmall} {
    width: calc(100% - 60px);
  }
`;

export const SearchBarContainer = styled.div`
  display: flex;
  align-items: center;
  margin-right: 1rem;

  ${breakpointMaxSmall} {
    width: 100%;
  }
`;

export const SearchBarContent = styled.div`
  ${breakpointMaxSmall} {
    width: 100%;
  }

  ${breakpointMinSmall} {
    position: relative;
    width: 460px;
  }
`;
