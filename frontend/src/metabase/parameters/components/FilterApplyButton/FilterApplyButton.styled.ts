import styled from "@emotion/styled";

import { breakpointMaxSmall, space } from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button/Button";

export const ApplyButton = styled(Button)`
  margin-left: auto;
  margin-top: ${space(1)};

  ${breakpointMaxSmall} {
    width: 100%;
    /* make button same height as fields on small screens */
    padding-top: 11px;
    padding-bottom: 11px;
  }
`;
