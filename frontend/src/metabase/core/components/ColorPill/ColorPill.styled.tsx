import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface ColorPillRootProps {
  isBordered?: boolean;
  isSelected?: boolean;
  isDefault?: boolean;
}

export const ColorPillRoot = styled.div<ColorPillRootProps>`
  display: inline-block;
  width: 2rem;
  height: 2rem;
  padding: ${props => props.isBordered && "0.1875rem"};
  border-width: ${props => (props.isBordered ? "0.0625rem" : "0")};
  border-color: ${props =>
    props.isSelected ? color("border") : "transparent"};
  border-style: ${props => (props.isDefault ? "dashed" : "solid")};
  border-radius: 50%;
  cursor: pointer;
`;

export interface ColorPillContentProps {
  isBordered?: boolean;
}

export const ColorPillContent = styled.div<ColorPillContentProps>`
  width: ${props => (props.isBordered ? "1.5rem" : "2rem")};
  height: ${props => (props.isBordered ? "1.5rem" : "2rem")};
  border-radius: 50%;
`;
