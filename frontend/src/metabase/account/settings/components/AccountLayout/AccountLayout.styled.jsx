import styled from "styled-components";

import { breakpointMinSmall, space } from "metabase/styled-components/theme";

export const AccountContent = styled.div`
  margin: 0 auto;
  padding: ${space(1)};

  ${breakpointMinSmall} {
    width: 540px;
    padding: ${space(3)} ${space(2)};
  }
`;
