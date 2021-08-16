import styled from "styled-components";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";

export const AccountContent = styled.div`
  margin: 0 auto;
  padding-top: ${space(1)}
  padding-bottom: ${space(1)};

  ${breakpointMinSmall} {
    width: 540px;
    padding-top: ${space(2)};
    padding-bottom: ${space(3)};
  }
`;
