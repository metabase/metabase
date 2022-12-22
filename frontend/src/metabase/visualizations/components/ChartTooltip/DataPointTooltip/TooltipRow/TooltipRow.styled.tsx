import styled from "@emotion/styled";
import { color, darken } from "metabase/lib/colors";

interface ColorIndicatorProps {
  size: number;
  color: string;
}

export const ColorIndicator = styled.span<ColorIndicatorProps>`
  display: inline-block;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  background-color: ${props => props.color};
  border-radius: 100%;
`;

export const Cell = styled.td`
  vertical-align: middle;
  padding: 0.375rem 0.5rem;
  font-weight: 700;

  & + & {
    padding-left: 0.5rem;
  }

  &:first-child {
    text-align: center;
  }

  &:first-child,
  &:last-child {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  &:first-child {
    border-top-left-radius: 4px;
    border-bottom-left-radius: 4px;
  }
  &:last-child {
    border-bottom-right-radius: 4px;
    border-top-right-radius: 4px;
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
