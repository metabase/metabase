import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes, MutableRefObject } from "react";

import { color } from "metabase/lib/colors";
import { breakpointMaxSmall } from "metabase/styled-components/theme";
import type { ButtonProps as BaseButtonProps } from "metabase/ui";
import { Button, Flex } from "metabase/ui";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;
export const PolicyToken = styled(Button)<
  { variant?: string; ref?: MutableRefObject<HTMLButtonElement> } & ButtonProps
>`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  padding: 1rem;
  border-width: 1px;
  border-style: solid;
  justify-content: center;

  ${({ variant }) =>
    css`
      border-color: ${color(
        ["filled", "outline"].includes(variant || "") ? "brand" : "border",
      )} !important;
    `};
  span {
    gap: 0.5rem;
  }
  ${breakpointMaxSmall} {
    flex: 1;
  }
`;
PolicyToken.defaultProps = { radius: "sm" };

export const StyledLauncher = styled(Flex)<
  {
    forRoot?: boolean;
    inheritsRootStrategy?: boolean;
    variant?: string;
    ref?: MutableRefObject<HTMLDivElement>;
  } & ButtonProps
>`
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  padding: 1rem;
  border-width: 1px;
  border-style: solid;
  justify-content: center;
  width: 100%;
  ${({ variant }) =>
    css`
      border-color: ${color(
        ["filled", "outline"].includes(variant || "") ? "brand" : "border",
      )} !important;
    `};
  font-weight: ${({ forRoot, inheritsRootStrategy }) =>
    forRoot || inheritsRootStrategy ? "normal" : "bold"};
  background-color: ${({ forRoot }) => color(forRoot ? "bg-medium" : "white")};
  ${({ forRoot }) => (forRoot ? "" : `border: 1px solid ${color("border")}`)};
  flex-direction: row;
  align-items: center;
  ${breakpointMaxSmall} {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
`;
