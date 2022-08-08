import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList";

import { color } from "metabase/lib/colors";

export const FilterButton = styled(Button)`
  color: ${color("brand")};
  margin: 0.5rem;
`;

export const ResponsiveParametersListRoot = styled.div`
  width: 100%;
`;

interface ParametersListContainerProps {
  isSmallScreen: boolean;
  mobileShow: boolean;
}

export const ParametersListContainer = styled.div<ParametersListContainerProps>`
  background-color: ${color("bg-light")};

  ${({ isSmallScreen, mobileShow }) =>
    isSmallScreen &&
    `
    position: absolute;
    top: 0;
    left: 0;
    
    width: 100%;
    border-bottom: 1px solid ${color("border")};
    
    overflow-y: auto;
    bottom: ${mobileShow ? "0" : "100%"};
    padding-bottom: ${mobileShow ? "0.5rem" : "0"};
    opacity: ${mobileShow ? "1" : "0"};
    transition: opacity 250ms;

    ${StyledParametersList} {
      position: relative;
      top: ${mobileShow ? "0" : "15px"};
      transition: top 250ms;
    }
  `}
`;

export const ParametersListHeader = styled.div`
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const StyledParametersList = styled(SyncedParametersList)`
  margin: 0 1rem;
`;
