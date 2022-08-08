import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList";

import { color } from "metabase/lib/colors";

export const FilterButton = styled(Button)`
  color: ${color("brand")};
  margin: 0.5rem;
`;
interface ResponsiveParametersListRootProps {
  isSmallScreen: boolean;
}
export const ResponsiveParametersListRoot = styled.div<ResponsiveParametersListRootProps>`
  width: 100%;
`;

export const ParametersListContainer = styled.div`
  background-color: ${color("bg-light")};
  ${props =>
    props.isSmallScreen &&
    `
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 100%;
    border-bottom: 1px solid ${color("border")};
    padding-bottom: 0.5rem;
    overflow-y: auto;
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
