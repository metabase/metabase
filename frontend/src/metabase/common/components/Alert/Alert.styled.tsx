// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

import type { AlertVariant } from "./Alert";

interface AlertRootProps {
  hasBorder?: boolean;
  variant: AlertVariant;
}

const colorsByVariant = {
  border: {
    info: "var(--mb-color-background-tertiary)",
    error: color("error"),
    warning: color("warning"),
  },
  background: {
    info: "var(--mb-color-background-secondary)",
    error: color("background-error"),
    warning: color("background-warning"),
  },
  icon: {
    info: color("text-primary"),
    error: color("error"),
    warning: color("warning"),
  },
};

export const AlertRoot = styled.div<AlertRootProps>`
  display: flex;
  align-items: center;
  padding: 1.25rem 1rem;
  line-height: 1.4rem;
  color: var(--mb-color-text-primary);
  ${(props) =>
    props.hasBorder
      ? css`
          border: 1px solid ${colorsByVariant.border[props.variant]};
        `
      : null};
  border-radius: 0.5rem;
  background-color: ${(props) => colorsByVariant.background[props.variant]};
`;

interface BaseIconProps {
  variant: AlertVariant;
}

const BaseIcon = styled(Icon)<BaseIconProps>`
  box-sizing: content-box;
  flex-shrink: 0;
  padding: 0.5rem;
  color: ${(props) => colorsByVariant.icon[props.variant]};
`;

export const AlertIcon = styled(BaseIcon)<BaseIconProps>`
  padding: 0.5rem 1rem 0.5rem 0.5rem;
`;

export const CloseIcon = styled(BaseIcon)<BaseIconProps>`
  margin-left: auto;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  cursor: pointer;
`;
