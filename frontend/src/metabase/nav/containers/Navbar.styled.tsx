import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

import { NAV_SIDEBAR_WIDTH } from "../constants";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

const openNavbarCSS = css`
  width: ${NAV_SIDEBAR_WIDTH};

  border-right: 1px solid ${color("border")};

  ${breakpointMaxSmall} {
    width: 90vw;
  }
`;

export const Sidebar = styled.aside<{ isOpen: boolean }>`
  width: 0;
  height: 100%;

  position: relative;
  flex-shrink: 0;
  align-items: center;
  padding: 0.5rem 0;
  background-color: ${color("nav")};

  overflow: auto;
  overflow-x: hidden;
  z-index: 4;

  transition: width 0.2s;

  @media (prefers-reduced-motion) {
    transition: none;
  }

  ${props => props.isOpen && openNavbarCSS};

  ${breakpointMaxSmall} {
    position: absolute;
    top: 0;
    left: 0;
  }
`;

export const LogoIconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 2rem;
  height: 2rem;
`;

export const EntityMenuContainer = styled.div`
  display: flex;
  position: relative;
  align-items: center;
  padding-left: 0.5rem;
  z-index: 2;

  ${breakpointMinSmall} {
    padding-left: 1rem;
  }
`;
