import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const NavRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem 0.5rem 0;
  background-color: ${color("nav")};
`;

export const LogoLinkContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 4rem;
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
