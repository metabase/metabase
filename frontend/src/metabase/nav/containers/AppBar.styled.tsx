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
  margin-left: ${space(1)};
  position: absolute;
  background-color: ${color("bg-light")};
  }
`;

export const SidebarButtonContainer = styled.div`
  left: 10px;
  opacity: 0;
  position: absolute;
  top: 8px;
`;

export const RowLeft = styled.div`
  display: flex;
  height: 100%;
  flex-direction: row;
  align-items: center;
  width: 50%;

  &:hover {
    ${LogoIconWrapper} {
      opacity: 0;
    }

    ${SidebarButtonContainer} {
      opacity: 1;
    }
  }
`;

export const RowRight = styled(RowLeft)`
  justify-content: flex-end;
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
    width: 500px;
  }
`;
