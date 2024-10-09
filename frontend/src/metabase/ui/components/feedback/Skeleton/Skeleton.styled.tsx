import { type MantineThemeOverride, keyframes } from "@mantine/core";

import { color } from "metabase/lib/colors";

const shimmerAnimation = keyframes`
0% {
  transform: translateX(-100%);
}
100% {
  transform: translateX(100%);
}
`;

export const getSkeletonOverrides = (): MantineThemeOverride["components"] => {
  return {
    Skeleton: {
      styles: _theme => {
        return {
          // We replace Mantine's pulsing animation with a shimmer animation
          root: {
            backgroundColor: "rgba(245,248,250,1.0)",
            "&::before": {
              background: `linear-gradient(100deg, transparent, ${color("bg-medium")}, transparent) ! important`,
              animation: `${shimmerAnimation} 1.4s linear infinite`,
            },
            "&::after": {
              display: "none",
            },
          },
        };
      },
    },
  };
};
