import { Stack, Title, useMantineTheme } from "metabase/ui";
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
  const theme = useMantineTheme();
  const isDark = theme.colorScheme === "dark";

  return (
    <Card
      withBorder
      style={{
        width: "100%",
        height,
        display: "flex",
        flexDirection: "column",
        backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
        borderColor: isDark ? theme.colors.dark[4] : theme.colors.gray[3],
      }}
    >
      <Card.Section
        p="md"
        withBorder
        style={{
          borderColor: isDark ? theme.colors.dark[4] : theme.colors.gray[3],
          backgroundColor: isDark ? theme.colors.dark[6] : theme.colors.gray[0],
        }}
      >
        <Title
          order={4}
          style={{
            color: isDark ? theme.colors.dark[1] : theme.colors.dark[9],
          }}
        >
          {title}
        </Title>
      </Card.Section>
      <Card.Section p="md" style={{ flex: 1, overflow: "auto" }}>
        <Stack gap="sm">{children}</Stack>
      </Card.Section>
    </Card>
  );
}
