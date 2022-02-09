import styled from "@emotion/styled";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import { GridItem } from "metabase/components/Grid";

export const ActionBarContent = styled.div`
  padding: 0.5rem 1rem;

  ${breakpointMinSmall} {
    padding-left: 2rem;
    padding-right: 2rem;
  }
`;

export const ActionBarText = styled.div`
  margin-left: auto;
`;

export const ActionControlsRoot = styled.div`
  margin-left: 0.5rem;
`;

export const ActionGridItem = styled(GridItem)`
  width: 100%;
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  ${breakpointMinSmall} {
    width: 66.66%;
    padding-left: 1rem;
    padding-right: 1rem;
  }
`;

export const ActionGridItemContent = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 1rem;
`;

export const ActionGridPlaceholder = styled.div`
  width: 100%;

  ${breakpointMinSmall} {
    width: 33.33%;
  }
`;
