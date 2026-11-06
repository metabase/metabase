import type { ReactNode } from "react";

import { Box, Card, Stack, Text } from "metabase/ui";

import { useMetadataCardVariant } from "../MetadataCardVariant";

import S from "./TitledSection.module.css";

interface Props {
  children?: ReactNode;
  title?: string;
}

export const TitledSection = ({ children, title }: Props) => {
  const variant = useMetadataCardVariant();
  const titleText =
    title != null ? (
      <Text c="text-secondary" fw="bold" size="sm">
        {title}
      </Text>
    ) : null;

  if (variant === "outlined") {
    return (
      <Box className={S.outlined}>
        <Stack gap="lg">
          {titleText}
          {children}
        </Stack>
      </Box>
    );
  }

  return (
    <Card className={S.card} p="xl" pt="lg" withBorder>
      <Stack gap="xl">
        {titleText}
        {children}
      </Stack>
    </Card>
  );
};
