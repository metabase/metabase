import { Stack, Title, Box } from "metabase/ui";
import type { ReactNode } from "react";

interface BenchPanelProps {
  title: string;
  children: ReactNode;
  height?: string | number;
}

export function BenchPanel({
  title,
  children,
  height = "100%",
}: BenchPanelProps) {
  return (
    <Box
      style={{
        width: "100%",
        height,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mb-color-bg-secondary)",
        borderRight: "1px solid var(--mb-color-border)",
      }}
    >
      <Box
        p="md"
        style={{
          borderBottom: "1px solid var(--mb-color-border)",
          backgroundColor: "var(--mb-color-bg-secondary)",
        }}
      >
        <Title order={4}>{title}</Title>
      </Box>
      <Box p="md" style={{ flex: 1, overflow: "auto" }}>
        <Stack gap="sm">{children}</Stack>
      </Box>
    </Box>
  );
}
