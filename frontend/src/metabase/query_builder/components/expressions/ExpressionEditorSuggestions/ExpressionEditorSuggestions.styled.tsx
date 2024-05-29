import { css } from "@emotion/react";
import styled from "@emotion/styled";

import {
  HoverParent,
  PopoverHoverTarget as BasePopoverHoverTarget,
} from "metabase/components/MetadataInfo/InfoIcon";
import { color } from "metabase/lib/colors";

export const ExpressionList = styled.ul`
  min-width: 250px;
`;

export const SuggestionMatch = styled.span`
  font-weight: bold;
`;

const highlighted = css`
  color: ${color("white")};
  background-color: ${color("brand")};
`;

export const ExpressionListItem = styled.li<{ isHighlighted: boolean }>`
  display: flex;
  align-items: center;
  padding: 0 0.875rem;
  padding-right: 0.5rem;
  cursor: pointer;
  height: 2rem;
  display: flex;
  align-items: center;

  ${props => props.isHighlighted && highlighted}
`;

export const ExpressionListFooter = styled.a<{ isHighlighted: boolean }>`
  background: white;
  height: 2rem;
  color: ${color("text-medium")};
  display: flex;
  align-items: center;
  padding-left: 0.875rem;
  margin-top: 12px;

  ${props => props.isHighlighted && highlighted}
`;

export const SuggestionTitle = styled.span`
  margin-right: 1.5em;
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

export const GroupTitle = styled(ExpressionListItem)`
  font-weight: bold;
  font-size: 12px;
  color: ${color("text-medium")};
  pointer-events: none;
  margin-top: 12px;

  &:first-child {
    margin-top: 0;
  }
`;
