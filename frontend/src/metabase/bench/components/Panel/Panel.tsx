import { Stack, Title } from "metabase/ui";
import { Card } from "@mantine/core";
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
    <Card
      withBorder
      style={{
        width: "100%",
        height,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Card.Section p="md" withBorder>
        <Title order={4}>{title}</Title>
      </Card.Section>
      <Card.Section p="md" style={{ flex: 1, overflow: "auto" }}>
        <Stack gap="sm">{children}</Stack>
      </Card.Section>
    </Card>
  );
}
