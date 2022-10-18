import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

import { alpha, color, darken } from "metabase/lib/colors";

export const StyledLink = styled(Link)<{ isSelected: boolean }>`
  color: ${props =>
    props.isSelected ? color("brand") : darken(color("text-medium"), 0.25)};

  background-color: ${props =>
    props.isSelected ? alpha("brand", 0.2) : "unset"};

  font-weight: 700;
  padding: 6px;
  border-radius: 4px;

  &:hover {
    background-color: ${alpha("brand", 0.35)};
    color: ${color("brand")};
  }
`;
