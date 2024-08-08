import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

const spinnerAnimation = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

export const SpinnerRoot = styled.div`
  display: flex;
  align-items: center;
  font-size: 0;
`;

interface SpinnerIconProps {
  iconSize: number;
  borderWidth: number;
}

export const SpinnerIcon = styled.div<SpinnerIconProps>`
  display: inline-block;
  box-sizing: border-box;
  width: ${props => `${props.iconSize}px`};
  height: ${props => `${props.iconSize}px`};
  border: ${props => `${props.borderWidth}px`} solid transparent;
  border-top-color: currentColor;
  border-radius: ${props => `${props.iconSize / 2}px`};
  animation: ${spinnerAnimation} 1.3s infinite
    cubic-bezier(0.785, 0.135, 0.15, 0.86);

  &::after {
    content: "";
    display: inherit;
    box-sizing: inherit;
    width: inherit;
    height: inherit;
    border: ${props => `${props.borderWidth}px`} solid currentColor;
    border-radius: ${props => `${props.iconSize / 2}px`};
    opacity: 0.25;
    position: relative;
    top: ${props => `-${props.borderWidth}px`};
    left: ${props => `-${props.borderWidth}px`};
  }
`;
