import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import type { AlertVariant } from "./Alert";

interface AlertRootProps {
  hasBorder?: boolean;
  variant: AlertVariant;
}

const colorsByVariant = {
  border: {
    info: "var(--mb-color-bg-medium)",
    error: "var(--mb-color-error)",
    warning: color("warning"),
  },
  background: {
    info: "var(--mb-color-bg-light)",
    error: "var(--mb-color-bg-error)",
    warning: lighten("warning", 0.5),
  },
  icon: {
    info: color("text-dark"),
    error: "var(--mb-color-error)",
    warning: color("warning"),
  },
};

export const AlertRoot = styled.div<AlertRootProps>`
  display: flex;
  align-items: center;
  padding: 1.25rem 1rem;
  line-height: 1.4rem;
  color: var(--mb-color-text-dark);
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
