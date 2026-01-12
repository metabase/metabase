import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes, MutableRefObject } from "react";

import { breakpointMaxSmall } from "metabase/styled-components/theme";
import type { ButtonProps as BaseButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;
export const PolicyToken = styled((props: ButtonProps) => (
  <Button {...props} radius={props.radius ?? "sm"} />
))<
  { variant?: string; ref?: MutableRefObject<HTMLButtonElement> } & ButtonProps
>`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  padding: 1rem;
  border-width: 1px;
  border-style: solid;
  justify-content: center;

  ${({ variant }) => css`
    border-color: ${["filled", "outline"].includes(variant || "")
      ? "var(--mb-color-brand)"
      : "var(--mb-color-border)"} !important;
  `};
  span {
    gap: 0.5rem;
  }
  ${breakpointMaxSmall} {
    flex: 1;
  }
` as unknown as typeof Button;

export const StyledLauncher = styled.div<
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
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  ${({ variant }) => css`
    border-color: ${["filled", "outline"].includes(variant || "")
      ? "var(--mb-color-brand)"
      : "var(--mb-color-border)"} !important;
  `};
  font-weight: ${({ forRoot, inheritsRootStrategy }) =>
    forRoot || inheritsRootStrategy ? "normal" : "bold"};
  background-color: ${({ forRoot }) =>
    forRoot
      ? "var(--mb-color-background-tertiary)"
      : "var(--mb-color-background-primary)"};
  ${({ forRoot }) =>
    !forRoot &&
    css`
      border: 1px solid var(--mb-color-border);
    `};
  flex-direction: row;
  align-items: center;
  ${breakpointMaxSmall} {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
`; // FIXME, make this into CSS modules
