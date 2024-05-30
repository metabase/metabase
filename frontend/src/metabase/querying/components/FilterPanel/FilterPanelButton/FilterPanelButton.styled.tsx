import isPropValid from "@emotion/is-prop-valid";
import styled from "@emotion/styled";
import type { ButtonHTMLAttributes } from "react";

import { alpha, color } from "metabase/lib/colors";
import type { ButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

type FilterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonProps & {
    isExpanded: boolean;
  };

export const FilterButton = styled(Button, {
  shouldForwardProp: isPropValid,
})<FilterButtonProps>`
  color: ${({ isExpanded }) =>
    isExpanded ? "var(--mb-color-text-white)" : color("filter")};
  background-color: ${({ isExpanded }) =>
    isExpanded ? alpha("filter", 0.8) : alpha("filter", 0.2)};
  transition: border 300ms linear, background 300ms linear;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-filter);
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
