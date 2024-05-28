import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Box } from "metabase/ui";

export const ListBox = styled(Box)`
  border-right: 1px solid ${color("border")};
  height: 100%;
  width: 365px;
  flex-basis: 365px;
  background-color: ${color("bg-light")};

  &:last-child {
    background-color: white;
  }
`;
