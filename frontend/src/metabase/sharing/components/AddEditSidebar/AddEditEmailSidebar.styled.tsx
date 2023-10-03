import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Box, Switch } from "metabase/ui";

export const StyledBox = styled(Box)`
  border-top: 1px solid ${color("border")};
`;

export const StyledSwitch = styled(Switch)`
  .emotion-Switch-body {
    justify-content: space-between;
  }
`;
