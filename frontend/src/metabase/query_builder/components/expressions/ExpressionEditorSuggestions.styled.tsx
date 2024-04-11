import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { QueryColumnInfoIcon as BaseQueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import {
  HoverParent,
  PopoverHoverTarget as BasePopoverHoverTarget,
} from "metabase/components/MetadataInfo/InfoIcon";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import { alpha, color } from "metabase/lib/colors";

export const ExpressionPopover = styled(TippyPopover)`
  border-color: ${alpha("accent2", 0.2)};
  border-radius: 0;
`;

export const ExpressionList = styled.ul`
  min-width: 150px;
  overflow-y: auto;
`;

export const ExpressionListItem = styled.li<{ isHighlighted: boolean }>`
  display: flex;
  align-items: center;
  padding: 0 0.875rem;
  padding-right: 0.5rem;
  cursor: pointer;
  min-height: 1.625rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }

  ${({ isHighlighted }) =>
    isHighlighted &&
    css`
      color: ${color("white")};
      background-color: ${color("brand")};
    `}
`;

export const SuggestionSpanRoot = styled.span`
  color: ${color("text-medium")};
`;

interface SuggestionSpanContentProps {
  isHighlighted?: boolean;
}

export const SuggestionSpanContent = styled.span<SuggestionSpanContentProps>`
  color: ${props =>
    props.isHighlighted ? color("white") : color("text-dark")};
  font-weight: bold;
  background-color: ${props => props.isHighlighted && color("brand")};
`;

export const SuggestionTitle = styled.span`
  margin-right: 1.5em;
`;

export const QueryColumnInfoIcon = styled(BaseQueryColumnInfoIcon)`
  padding: 0;
  margin-left: auto;
  padding: 0.3125rem 0;
`;

export const PopoverHoverTarget = styled(BasePopoverHoverTarget)`
  padding: 0;
  margin-left: auto;
  padding: 0.3125rem 0;
  visibility: hidden;

  ${HoverParent}:hover & {
    visibility: visible;
  }
`;
