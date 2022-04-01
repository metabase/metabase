import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMaxSmall, space } from "metabase/styled-components/theme";

import { APP_BAR_HEIGHT } from "../constants";

export const AppBarRoot = styled.header`
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

export const SearchBarContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  padding-right: 1rem;
`;

export const SearchBarContent = styled.div`
  width: 100%;
  max-width: 500px;
  margin-left: auto;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;

  transition: max-width 0.2s;

  @media (prefers-reduced-motion) {
    transition: none;
  }

  ${breakpointMaxSmall} {
    max-width: 60vw;
  }
`;
