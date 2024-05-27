import { css, keyframes, type Theme } from "@emotion/react";

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
export const getAnimationStyles = (theme: Theme) => css`
  color: ${theme.fn.themeColor("bg-medium")};
  animation: ${fadingKeyframes} 1.5s infinite;
`;
