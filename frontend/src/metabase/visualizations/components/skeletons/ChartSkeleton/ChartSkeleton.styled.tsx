// eslint-disable-next-line no-restricted-imports
import { css, keyframes } from "@emotion/react";

const fadingKeyframes = keyframes`
  0% {
    opacity: 0.0625;
  }

  50% {
    opacity: 0.125;
  }

  100% {
    opacity: 0.0625;
  }
`;
export const animationStyles = css`
  opacity: 0.1;
  animation: ${fadingKeyframes} 1.5s infinite;
`;
