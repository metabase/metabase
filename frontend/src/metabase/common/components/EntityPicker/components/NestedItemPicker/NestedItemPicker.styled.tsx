import styled from "@emotion/styled";
import { Box, BoxProps } from "metabase/ui";

import { color } from "metabase/lib/colors";
import type React from "react";

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
    border-right: none;
    background-color: white;
  }
`;
