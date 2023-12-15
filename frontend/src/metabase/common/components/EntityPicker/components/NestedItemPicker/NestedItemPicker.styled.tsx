import styled from "@emotion/styled";
import type React from "react";
import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";

import { color } from "metabase/lib/colors";

export const HorizontalScrollBox = styled(Box)<
  BoxProps & React.HTMLProps<HTMLDivElement>
>`
  overflow-x: auto;
`;

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
