import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";
import TippyPopover from "metabase/components/Popover/TippyPopover";

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
  padding: 0.3125rem 0.875rem;
  cursor: pointer;

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
