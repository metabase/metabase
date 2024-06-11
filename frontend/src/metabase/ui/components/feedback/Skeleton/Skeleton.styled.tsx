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
  const win = window as {
    shimmerSkeletons?: boolean;
  };
  win.shimmerSkeletons ??= true;
  return {
    Skeleton: {
      styles: _theme => {
        return {
          root: win.shimmerSkeletons
            ? {
                "background-color": "rgba(0, 0, 0, .03)",
                "&::before": {
                  background:
                    "linear-gradient(100deg, transparent, rgba(0, 0, 0, .03) 50%, transparent) ! important",
                  animation: `${shimmerAnimation} 1.2s linear infinite`,
                },
                "&::after": {
                  display: "none",
                },
              }
            : {
                "&::before": {
                  background: "rgba(0, 0, 0, .03) ! important",
                },
                "&::after": {
                  background: "rgba(0, 0, 0, .06) ! important",
                },
              },
        };
      },
    },
  };
};
