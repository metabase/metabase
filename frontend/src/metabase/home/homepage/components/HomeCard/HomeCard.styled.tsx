import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";
import { css } from "@emotion/react";

export interface CardProps {
  primary?: boolean;
  secondary?: boolean;
}

export const CardRoot = styled(Link)<CardProps>`
  display: flex;
  align-items: center;
  padding: 1rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;

  ${props =>
    props.primary &&
    css`
      border: 1px solid ${color("border")};
      background-color: ${color("white")};
      box-shadow: 0 7px 20px ${color("shadow")};

      &:hover {
        box-shadow: 0 10px 22px ${alpha("shadow", 0.09)};
      }
    `}

  ${props =>
    props.secondary &&
    css`
      border: 1px solid ${color("focus")};
    `};
`;
