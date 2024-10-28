import styled from "@emotion/styled";

import { breakpointMaxSmall } from "metabase/styled-components/theme/media-queries";

export const QueryBuilderViewRoot = styled.div`
  display: flex;
  flex-direction: column;
  background-color: var(--mb-color-bg-white);
  height: 100%;
  position: relative;
`;

export const QueryBuilderContentContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  position: relative;

  ${breakpointMaxSmall} {
    justify-content: end;
  }
`;
