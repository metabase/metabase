import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes, MutableRefObject } from "react";

import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
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
`;
PolicyToken.defaultProps = { radius: "sm" };

export const StyledLauncher = styled(
  Flex,
  doNotForwardProps("forRoot", "inheritsRootStrategy"),
)<
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
      border-color: ${["filled", "outline"].includes(variant || "")
        ? "var(--mb-color-brand)"
        : "var(--mb-color-border)"} !important;
    `};
  font-weight: ${({ forRoot, inheritsRootStrategy }) =>
    forRoot || inheritsRootStrategy ? "normal" : "bold"};
  background-color: ${({ forRoot }) =>
    forRoot ? color("bg-medium") : color("bg-white")};
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
`;
