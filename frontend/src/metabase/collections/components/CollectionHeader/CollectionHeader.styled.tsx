import styled from "@emotion/styled";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";

export const HeaderRoot = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  margin-bottom: ${space(3)};
  padding-top: ${space(0)};

  ${breakpointMinSmall} {
    align-items: center;
    flex-direction: row;
    padding-top: ${space(1)};
  }
`;

export const HeaderActions = styled.div`
  display: flex;
  margin-top: ${space(1)};
  align-self: start;
`;
