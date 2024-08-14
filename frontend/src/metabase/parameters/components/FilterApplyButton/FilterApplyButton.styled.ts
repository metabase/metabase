import styled from "@emotion/styled";

import Button from "metabase/core/components/Button/Button";
import { breakpointMaxSmall, space } from "metabase/styled-components/theme";

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
