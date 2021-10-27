import styled, { keyframes } from "styled-components";

export const LoadingSpinnerRoot = styled.div`
  display: block;
`;

export const LoadingSpinnerAnimation = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

export const LoadingSpinnerIcon = styled.div`
  display: inline-block;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  border: 4px solid transparent;
  border-top-color: currentColor;
  border-radius: 99px;

  animation: ${LoadingSpinnerAnimation} 1.3s infinite
    cubic-bezier(0.785, 0.135, 0.15, 0.86);

  &::after {
    content: "";

    display: inherit;
    box-sizing: inherit;
    width: inherit;
    height: inherit;
    border: inherit;
    border-color: currentColor;
    border-radius: inherit;

    opacity: 0.25;
    position: relative;
    top: -4px;
    left: -4px;
  }

  @media (prefers-reduced-motion) {
    animation: none;
  }
`;
