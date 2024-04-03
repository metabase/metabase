import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import { color } from "metabase/lib/colors";
import type { ButtonProps as BaseButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;

export const Panel = styled.section<{ hasVerticalScrollbar?: boolean }>`
  overflow-y: auto;
  display: flex;
  flex-flow: column nowrap;
  background-color: ${color("white")};
  border-style: solid;
  border-color: ${color("border")};
  border-block-width: 2px;
  border-inline-end-width: 1px;
  border-inline-start-width: 0;
  &:first-child {
    border-inline-start-width: 2px;
    border-start-start-radius: 1rem;
    border-end-start-radius: 1rem;
  }
  &:last-child {
    border-inline-end-width: 2px;
  }
  ${props =>
    !props.hasVerticalScrollbar &&
    css`
      &:last-child {
        border-start-end-radius: 1rem;
        border-end-end-radius: 1rem;
      }
    `}
`;

export const PolicyToken = styled(Button)<{ variant: string } & ButtonProps>`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  padding: 1rem;
  border-width: 1px;
  border-style: solid;
  ${({ variant }) =>
    `${
      ["filled", "outline"].includes(variant)
        ? `border-color ${color("brand")} ! important;`
        : `border-color: ${color("border")} ! important;`
    }`};
  span {
    gap: 0.5rem;
  }
`;
PolicyToken.defaultProps = { radius: "sm" };

export const TabWrapper = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
`;
