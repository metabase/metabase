import styled from "styled-components";
import { color } from "metabase/lib/colors";

export interface ToggleRootProps {
  checked?: boolean;
  small?: boolean;
  currentColor?: string;
}

const getLeft = ({ checked, small }: ToggleRootProps): string => {
  if (!checked) {
    return "1px";
  } else if (!small) {
    return "25px";
  } else {
    return "12px";
  }
};

const getBackgroundColor = ({
  checked,
  currentColor,
}: ToggleRootProps): string => {
  if (checked) {
    return currentColor ?? color("brand");
  } else {
    return color("bg-medium");
  }
};

export const ToggleRoot = styled.input<ToggleRootProps>`
  appearance: none;
  position: relative;
  display: inline-block;
  color: ${props => props.currentColor ?? color("brand")};
  cursor: pointer;
  width: ${props => (props.small ? "28px" : "48px")};
  height: ${props => (props.small ? "17px" : "24px")};
  border-radius: 99px;
  border: 1px solid ${color("border")};
  background-color: ${color("bg-medium")};
  background-color: ${getBackgroundColor};
  transition: all 0.3s;
  text-decoration: none;

  &:after {
    content: "";
    width: ${props => (props.small ? "13px" : "20px")};
    height: ${props => (props.small ? "13px" : "20px")};
    border-radius: 99px;
    position: absolute;
    top: 1px;
    left: ${getLeft};
    background-color: ${color("white")};
    transition: all 0.3s;
    box-shadow: 2px 2px 6px ${color("shadow")};
  }

  &:focus-visible {
    outline: 2px solid var(--color-brand-light);
  }
`;
