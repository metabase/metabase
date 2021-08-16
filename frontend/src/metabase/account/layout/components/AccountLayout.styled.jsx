import styled from "styled-components";
import colors from "metabase/lib/colors";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";

export const AccountLayoutRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-top: ${space(1)};
  border-bottom: 1px solid ${colors["border"]};

  ${breakpointMinSmall} {
    padding-top: ${space(2)};
  }
`;

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
