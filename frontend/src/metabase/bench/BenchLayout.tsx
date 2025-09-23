import { MantineProvider, AppShell, Box } from "@mantine/core";
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
      <AppShell padding="md">
        <AppShell.Main>
          <Box p="xl">
            {children}
          </Box>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
