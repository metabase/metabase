import type { ButtonHTMLAttributes } from "react";
import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import { Button } from "metabase/ui";
import type { ButtonProps } from "metabase/ui";

type FilterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonProps & {
    isExpanded: boolean;
  };

export const FilterButton = styled(Button)<FilterButtonProps>`
  color: ${color("filter")};
  background-color: ${({ isExpanded }) =>
    isExpanded ? alpha("filter", 0.8) : alpha("filter", 0.2)};

  &:hover {
    color: ${color("white")};
    background-color: ${color("filter")};
  }
`;
