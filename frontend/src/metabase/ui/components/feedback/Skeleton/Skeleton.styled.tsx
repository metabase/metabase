import { type MantineThemeOverride, keyframes } from "@mantine/core";

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
            backgroundColor: "var(--mb-color-background-disabled)",
            "&::before": {
              background:
                "linear-gradient(100deg, transparent, var(--mb-color-bg-medium), transparent) ! important",
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
