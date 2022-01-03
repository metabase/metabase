import styled from "styled-components";
import { color } from "metabase/lib/colors";

export interface ToggleRootProps {
  isSmall?: boolean;
  isSelected?: boolean;
  currentColor?: string;
}

const getLeft = ({ isSmall, isSelected }: ToggleRootProps): string => {
  if (!isSelected) {
    return "1px";
  } else if (!isSmall) {
    return "25px";
  } else {
    return "12px";
  }
};

const getBackgroundColor = ({
  isSelected,
  currentColor,
}: ToggleRootProps): string => {
  if (isSelected) {
    return currentColor ?? color("brand");
  } else {
    return color("white");
  }
};

export const ToggleRoot = styled.a<ToggleRootProps>`
  position: relative;
  display: inline-block;
  color: ${props => props.currentColor ?? color("brand")};
  box-sizing: border-box;
  width: ${props => (props.isSmall ? "28px" : "48px")};
  height: ${props => (props.isSmall ? "17px" : "24px")};
  border-radius: 99px;
  border: 1px solid ${color("border")};
  background-color: ${color("bg-medium")};
  background-color: ${getBackgroundColor};
  transition: all 0.3s;
  text-decoration: none;

  &:after {
    content: "";
    width: ${props => (props.isSmall ? "13px" : "20px")};
    height: ${props => (props.isSmall ? "13px" : "20px")};
    border-radius: 99px;
    position: absolute;
    top: 1px;
    left: ${getLeft};
    background-color: ${color("white")};
    transition: all 0.3s;
    box-shadow: 2px 2px 6px ${color("shadow")};
  }
`;
