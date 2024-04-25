import styled from "@emotion/styled";
import type { ButtonHTMLAttributes } from "react";

import { alpha, color } from "metabase/lib/colors";
import type { ButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

type FilterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonProps & {
    isExpanded: boolean;
  };

export const FilterButton = styled(Button)<FilterButtonProps>`
  color: ${({ isExpanded }) => (isExpanded ? color("white") : color("filter"))};
  background-color: ${({ isExpanded }) =>
    isExpanded ? alpha("filter", 0.8) : alpha("filter", 0.2)};
  transition: border 300ms linear, background 300ms linear;

  &:hover {
    color: ${color("white")};
    background-color: ${color("filter")};
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
