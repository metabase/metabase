import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Icon from "metabase/components/Icon/Icon";
import type { ClickActionButtonType } from "metabase/modes/types";

export type SectionType = "records" | string;

interface ClickActionButtonProps {
  type?: ClickActionButtonType;
}

export const Container = styled.div`
  min-width: 256px;

  padding: 1rem 1rem 1.5rem;

  font-weight: 700;
`;

export const Section = styled.div<{
  type: SectionType;
  hasOnlyOneSection: boolean;
}>`
  &:not(:last-child):not(:first-child) {
    padding-bottom: 1rem;
  }

  ${({ type, hasOnlyOneSection }) =>
    type === "records" &&
    css`
      &:after {
        ${!hasOnlyOneSection ? `content: "";` : ""};
        height: 1px;
        background-color: ${color("border")};
        margin: 1rem -1.5rem 1rem;
        display: block;
      }
    `}
`;

export const ActionIcon = styled(Icon)`
  margin-right: 0.75rem;

  color: ${color("brand")};
`;

// TODO [#26836]: refactor this to be a button
export const ClickActionButton = styled.div<ClickActionButtonProps>`
  ${({ type }) =>
    type === "sort" &&
    css`
      color: ${color("brand")};
      border: 1px solid ${alpha("brand", 0.35)};
      margin-right: 0.5rem;

      &:hover {
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
      border-radius: 8px;

      color: ${color("text-dark")};

      font-weight: 700;
      line-height: 17px;

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};

        ${ActionIcon} {
          color: ${color("white")};
        }
      }
    `}

  ${({ type }) =>
    type === "token" &&
    css`
      color: ${color("brand")};
      font-size: 0.875em;
      line-height: 1rem;
      margin-right: 0.5rem;
      padding: 0.3125rem 0.875rem;
      border: 1px solid ${alpha("brand", 0.35)};
      border-radius: 100px;

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};
      }
    `}

  ${({ type }) =>
    type === "token-filter" &&
    css`
      color: ${color("filter")};
      font-size: 0.875em;
      line-height: 1rem;
      padding: 0.125rem 1rem;
      border: 1px solid ${alpha("filter", 0.5)};
      border-radius: 100px;
      margin-right: 0.5rem;

      &:hover {
        color: ${color("white")};
        background-color: ${color("filter")};
      }
    `}
`;

export const FlexTippyPopover = styled(TippyPopover)`
  display: flex;

  &.tippy-box {
    border: none;
  }
`;
