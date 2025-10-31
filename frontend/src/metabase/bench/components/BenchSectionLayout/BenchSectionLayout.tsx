import type { ReactNode } from "react";

import { Box, Group, Stack } from "metabase/ui";

import S from "./BenchSectionLayout.module.css";

type BenchSectionLayoutProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function BenchSectionLayout({
  title,
  description,
  children,
}: BenchSectionLayoutProps) {
  return (
    <Stack h="100%" gap={0}>
      <BenchHeader title={title} description={description} />
      <Box flex={1}>{children}</Box>
    </Stack>
  );
}

type BenchHeaderProps = {
  title: string;
  description: string;
};

function BenchHeader({ title, description }: BenchHeaderProps) {
  return (
    <Stack className={S.header} px="lg" py="md">
      <Group gap="md">
        <Box fz="lg" lh="h3">
          {title}
        </Box>
        <Box c="text-secondary">{description}</Box>
      </Group>
    </Stack>
  );
}
