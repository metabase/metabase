import { css, keyframes } from "@emotion/react";

export const fadingKeyframes = keyframes`
  0% {
    opacity: 0.5;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0.5;
  }
`;

export const positionStyles = css`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

export const animationStyles = css`
  animation: ${fadingKeyframes} 1.5s infinite;
`;
