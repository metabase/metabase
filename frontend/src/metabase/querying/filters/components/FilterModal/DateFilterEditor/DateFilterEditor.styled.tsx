import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Button, Icon } from "metabase/ui";

export const ClearIcon = styled(Icon)`
  color: var(--mb-color-brand);
`;

export const ToggleButton = styled<any>(Button)`
  padding: 8px 16px !important;

  ${props =>
    props.variant === "filled" &&
    css`
      color: white;
    `};

  ${props =>
    props.variant === "subtle" &&
    css`
      color: var(--mb-color-text-medium);

      &:hover {
        background-color: hsla(208, 95%, 42%, 0.07);
        color: var(--mb-color-text-medium);
      }
    `};
`;

export const MoreButton = styled<any>(Button)`
  color: var(--mb-color-text-medium);

  &:hover {
    color: var(--mb-color-text-medium);
  }
`;
