// HACK - For the real real we'd export these from metabase/ui
//eslint-disable-next-line
import { AppShell, Container } from "@mantine/core";
import { color } from "metabase/lib/colors";

import type { ColorScheme } from "./color-context";
import { ColorProvider, useColors } from "./color-context";
import { Sidebar } from "./sidebar";

function EmbeddingLayoutContent({ children }: { children: React.ReactNode }) {
  const { sideNavBackground, mainBackground } = useColors();

  // Get the actual background color based on selection
  const getBackgroundColor = (selection: ColorScheme) => {
    return selection === "white" ? "white" : color("bg-light");
  };

  const sideNavBg = getBackgroundColor(sideNavBackground);
  const mainBg = getBackgroundColor(mainBackground);

  return (
    <AppShell navbar={{ width: 300, breakpoint: "md" }} header={{ height: 66 }}>
      <AppShell.Navbar
        p="md"
        bg={sideNavBg}
        style={{ borderRight: `1px solid ${color("border")}` }}
      >
        <Sidebar />
      </AppShell.Navbar>
      <AppShell.Main bg={mainBg}>
        <Container>{children}</Container>
      </AppShell.Main>
    </AppShell>
  );
}

export function EmbeddingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ColorProvider>
      <EmbeddingLayoutContent>{children}</EmbeddingLayoutContent>
    </ColorProvider>
  );
}
