import type { EmotionCache } from "@emotion/react";
import { withEmotionCache } from "@emotion/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

import { getThemeOverrides } from "../../../theme";
import { DatesProvider } from "../DatesProvider";

interface ThemeProviderProps {
  children: ReactNode;
  dir?: "ltr" | "rtl";
}

export const ThemeProvider = withEmotionCache(
  ({ children, dir = "ltr" }: ThemeProviderProps, cache: EmotionCache) => {
    const theme = { ...getThemeOverrides(), dir };
    return (
      <MantineProvider theme={theme} emotionCache={cache}>
        <DatesProvider>{children}</DatesProvider>
      </MantineProvider>
    );
  },
);

export const Direction = ({
  children,
  dir,
}: {
  children: ReactNode;
  dir: "ltr" | "rtl";
}) => {
  return (
    <ThemeProvider dir={dir}>
      <div dir={dir} style={{ height: "100%" }}>
        {children}
      </div>
    </ThemeProvider>
  );
};
