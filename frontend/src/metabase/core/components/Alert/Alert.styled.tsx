import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import type { AlertVariant } from "./Alert";

export interface AlertRootProps {
  hasBorder?: boolean;
  variant: AlertVariant;
}

const colorsByVariant = {
  border: {
    info: color("bg-medium"),
    error: color("error"),
    warning: color("warning"),
  },
  background: {
    info: color("bg-light"),
    error: lighten("error", 0.4),
    warning: lighten("warning", 0.5),
  },
  icon: {
    info: color("text-dark"),
    error: color("error"),
    warning: color("warning"),
  },
};

export const AlertRoot = styled.div<AlertRootProps>`
  display: flex;
  align-items: center;
  padding: 1.25rem 1rem;
  line-height: 1.4rem;
  color: ${color("text-dark")};
  ${props =>
    props.hasBorder
      ? css`
          border: 1px solid ${colorsByVariant.border[props.variant]};
        `
      : null};
  border-radius: 0.5rem;
  background-color: ${props => colorsByVariant.background[props.variant]};
`;

interface AlertIconProps {
  variant: AlertVariant;
}

export const AlertIcon = styled(Icon)<AlertIconProps>`
  flex-shrink: 0;
  padding: 0.5rem 1rem 0.5rem 0.5rem;
  color: ${props => colorsByVariant.icon[props.variant]};
`;

export const AlertLink = styled.a`
  color: ${color("brand")};
  cursor: pointer;
  font-weight: bold;
`;
