import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList";

import { color } from "metabase/lib/colors";

export const FilterButton = styled(Button)`
  color: ${color("brand")};
  margin: 0.5rem;
`;
interface ParametersListContainerProps {
  isSmallScreen: boolean;
}
export const ParametersListContainer = styled.div<ParametersListContainerProps>`
  ${props =>
    props.isSmallScreen &&
    `
    max-height: 200px;
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
  margin: 0 1rem 0.5rem 1rem;
`;
