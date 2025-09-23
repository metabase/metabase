import { MantineProvider } from "@mantine/core";
import { Box } from "metabase/ui";
import type { ReactNode } from "react";

interface BenchLayoutProps {
  children: ReactNode;
}

const benchTheme = {
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: "system-ui, sans-serif",
};

export function BenchLayout({ children }: BenchLayoutProps) {
  return (
    <MantineProvider theme={benchTheme}>
      <Box style={{ height: "100vh", overflow: "hidden" }}>{children}</Box>
    </MantineProvider>
  );
}
