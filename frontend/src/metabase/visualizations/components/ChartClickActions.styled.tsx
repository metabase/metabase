import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";
import TippyPopover from "metabase/components/Popover/TippyPopover";

export interface ClickActionButtonProps {
  type: "sort" | "formatting" | "horizontal" | "token" | "token-filter";
}

export const ClickActionButton = styled.div<ClickActionButtonProps>`
  ${({ type }) =>
    type === "sort" &&
    css`
      color: ${color("text-dark")};
      border: 1px solid ${color("border")};
      margin-right: 0.5rem;

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};
      }
    `}

  ${({ type }) =>
    type === "formatting" &&
    css`
      color: ${alpha("text-light", 0.65)};
      margin-left: auto;

      &:hover {
        color: ${color("brand")};
      }
    `}

  ${({ type }) =>
    type === "horizontal" &&
    css`
      display: flex;
      flex: auto;
      align-items: center;
      padding: 0.5rem;
      color: ${color("text-dark")};

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};
      }
    `}

  ${({ type }) =>
    type === "token" &&
    css`
      color: ${color("text-dark")};
      font-size: 0.875em;
      line-height: 1rem;
      margin-right: 0.5rem;
      padding: 0.3125rem 0.875rem;
      border: 1px solid ${color("border")};
      border-radius: 100px;

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};
      }
    `}

  ${({ type }) =>
    type === "token-filter" &&
    css`
      color: ${color("text-dark")};
      font-size: 0.875em;
      line-height: 1rem;
      padding: 0.125rem 1rem;
      border: 1px solid ${color("border")};
      border-radius: 100px;
      margin-right: 0.5rem;

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};
      }
    `}
`;

export const FlexTippyPopover = styled(TippyPopover)`
  display: flex;
`;
