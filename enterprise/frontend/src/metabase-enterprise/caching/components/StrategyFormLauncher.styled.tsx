import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes, MutableRefObject } from "react";

import { color } from "metabase/lib/colors";
import type { ButtonProps as BaseButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;
export const PolicyToken = styled(Button)<
  { variant: string; ref: MutableRefObject<HTMLButtonElement> } & ButtonProps
>`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  padding: 1rem;
  border-width: 1px;
  border-style: solid;
  ${({ variant }) =>
    css`
      border-color: ${color(
        ["filled", "outline"].includes(variant) ? "brand" : "border",
      )} !important;
    `};
  span {
    gap: 0.5rem;
  }
`;
PolicyToken.defaultProps = { radius: "sm" };
