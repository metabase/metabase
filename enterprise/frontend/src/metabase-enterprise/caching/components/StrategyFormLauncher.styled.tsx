import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes, MutableRefObject } from "react";

import type { ButtonProps as BaseButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;

const getVariantBorderColor = (variant?: string) =>
  ["filled", "outline"].includes(variant || "")
    ? "var(--mb-color-brand)"
    : "var(--mb-color-border)";

export const PolicyToken = styled(Button)<
  { variant?: string; ref?: MutableRefObject<HTMLButtonElement> } & ButtonProps
>`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  padding: 1rem;
  border-width: 1px;
  border-style: solid;
  ${({ variant }) =>
    css`
      border-color: ${getVariantBorderColor(variant)} !important;
    `};
  span {
    gap: 0.5rem;
  }
`;
PolicyToken.defaultProps = { radius: "sm" };
