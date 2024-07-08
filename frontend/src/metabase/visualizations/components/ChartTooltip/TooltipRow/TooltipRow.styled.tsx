import styled from "@emotion/styled";

import { color, darken } from "metabase/lib/colors";

interface TooltipRowRootProps {
  isHeader?: boolean;
}

export const TooltipRowRoot = styled.tr<TooltipRowRootProps>`
  font-size: ${props => (props.isHeader ? "14px" : "12px")};
`;

interface ColorIndicatorProps {
  size: number;
  color: string;
}

export const ColorIndicator = styled.span<ColorIndicatorProps>`
  display: block;
  margin: 0 auto;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  background-color: ${props => props.color};
  border-radius: 100%;
`;

export const Cell = styled.td`
  vertical-align: middle;
  padding: 0.375rem 0.5rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;

  & + & {
    padding-left: 0.5rem;
  }

  &:first-of-type,
  &:last-of-type {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  &:first-of-type {
    border-top-left-radius: 4px;
    border-bottom-left-radius: 4px;
  }

  &:last-of-type {
    border-bottom-right-radius: 4px;
    border-top-right-radius: 4px;
  }
`;

export const ColorIndicatorCell = styled(Cell)`
  width: 1%;
  text-align: center;

  && {
    padding-right: 0.25rem;
  }
`;

export const ValueCell = styled(Cell)`
  padding-left: 2rem;
  text-align: right;
`;

export const PercentCell = styled(Cell)`
  padding-left: 1rem;
  color: ${color("text-light")};
  text-align: right;
`;

export const TotalRowRoot = styled.tr`
  width: 100%;
  border-radius: 60px;
  background-color: ${darken("text-dark", 0.6)};
`;
