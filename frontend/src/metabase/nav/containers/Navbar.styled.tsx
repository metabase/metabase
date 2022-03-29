import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import { NAV_SIDEBAR_WIDTH } from "../constants";

const openNavbarCSS = css`
  visibility: visible;
  width: ${NAV_SIDEBAR_WIDTH};
`;

export const NavRoot = styled.div<{ isOpen: boolean }>`
  width: 0;
  height: 100%;
  visibility: hidden;

  position: relative;
  flex-shrink: 0;
  align-items: center;
  padding: 0.5rem 0;
  background-color: ${color("nav")};

  overflow: auto;
  overflow-x: hidden;
  z-index: 3;

  border-right: 1px solid ${color("border")};

  ${props => props.isOpen && openNavbarCSS};
  }
`;

export const LogoIconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 2rem;
  height: 2rem;
`;

export const SearchBarContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  padding-right: 1rem;
  z-index: 1;
`;

export const SearchBarContent = styled.div`
  width: 100%;
  max-width: 500px;
  margin-left: auto;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
`;

export const EntityMenuContainer = styled.div`
  display: flex;
  position: relative;
  align-items: center;
  margin-left: auto;
  padding-left: 0.5rem;
  z-index: 2;

  ${breakpointMinSmall} {
    padding-left: 1rem;
  }
`;
