// HACK - For the real real we'd export these from metabase/ui
//eslint-disable-next-line
import { AppShell, Container } from "@mantine/core";
import { color } from "metabase/lib/colors";

import { Sidebar } from "./sidebar";

export function EmbeddingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell navbar={{ width: 300, breakpoint: "md" }} header={{ height: 66 }}>
      <AppShell.Navbar
        p="md"
        bg={color("bg-light")}
        style={{ borderRight: `1px solid ${color("border")}` }}
      >
        <Sidebar />
      </AppShell.Navbar>
      <AppShell.Main>
        <Container>{children}</Container>
      </AppShell.Main>
    </AppShell>
  );
}
