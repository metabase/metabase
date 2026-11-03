import type { ReactNode } from "react";

import { Badge, Box, Group, Stack, Text, Title } from "metabase/ui";

interface PrototypeFrameProps {
  step: string;
  title: string;
  description: ReactNode;
  isBroken?: boolean;
  height?: number;
  children: ReactNode;
}

export function PrototypeFrame({
  step,
  title,
  description,
  isBroken = false,
  height = 640,
  children,
}: PrototypeFrameProps) {
  return (
    <Stack gap="md" p="lg" bg="background_page-secondary" mih="100vh">
      <Stack gap="xs" maw={980}>
        <Group gap="sm">
          <Badge color={isBroken ? "negative" : "brand"} variant="filled">
            {step}
          </Badge>
          <Title order={3}>{title}</Title>
        </Group>
        <Text c="text-secondary">{description}</Text>
      </Stack>
      <Box
        h={height}
        bg="background_page-primary"
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="md"
        style={{ overflow: "hidden", boxShadow: "var(--mb-shadow-md, none)" }}
      >
        {children}
      </Box>
    </Stack>
  );
}
