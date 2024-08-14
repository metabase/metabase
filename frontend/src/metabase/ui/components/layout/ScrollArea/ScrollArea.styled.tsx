import type { MantineThemeOverride } from "@mantine/core";

export const getScrollAreaOverrides =
  (): MantineThemeOverride["components"] => ({
    ScrollArea: {
      styles: () => ({
        root: {
          "& [data-radix-scroll-area-viewport]": {
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",

            "&::-webkit-scrollbar": {
              display: "none",
            },
          },
        },
      }),
    },
  });
