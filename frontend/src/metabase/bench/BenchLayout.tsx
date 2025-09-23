import { MantineProvider } from "@mantine/core";
import { Box } from "metabase/ui";
import type { ReactNode } from "react";
import { useDarkMode } from "./hooks/useDarkMode";

interface BenchLayoutProps {
  children: ReactNode;
}

const lightTheme = {
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: "system-ui, sans-serif",
  colorScheme: "light" as const,
  colors: {
    dark: [
      "#C1C2C5",
      "#A6A7AB",
      "#909296",
      "#5c5f66",
      "#373A40",
      "#2C2E33",
      "#25262b",
      "#1A1B1E",
      "#141517",
      "#101113",
    ],
  },
};

const darkTheme = {
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: "system-ui, sans-serif",
  colorScheme: "dark" as const,
  colors: {
    dark: [
      "#d5d7e0",
      "#acaebf",
      "#8c8fa3",
      "#666980",
      "#4d4f66",
      "#34354a",
      "#2b2c3d",
      "#1d1e30",
      "#0c0d21",
      "#01010a",
    ],
  },
};

export function BenchLayout({ children }: BenchLayoutProps) {
  const isDarkMode = useDarkMode();
  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <MantineProvider theme={theme}>
      <Box
        style={{
          height: "100vh",
          overflow: "hidden",
          backgroundColor: isDarkMode ? "#1A1B1E" : "#ffffff",
          color: isDarkMode ? "#C1C2C5" : "#000000",
        }}
      >
        {children}
      </Box>
    </MantineProvider>
  );
}
