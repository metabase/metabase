import { keyframes, type MantineThemeOverride } from "@mantine/core";

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
            backgroundColor: "rgba(0, 0, 0, .03)",
            "&::before": {
              background:
                "linear-gradient(100deg, transparent, rgba(0, 0, 0, .03) 50%, transparent) ! important",
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
