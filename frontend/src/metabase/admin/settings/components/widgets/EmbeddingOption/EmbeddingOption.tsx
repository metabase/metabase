import type { ReactNode } from "react";

import { useUniqueId } from "metabase/hooks/use-unique-id";
import { Flex, Paper, Text, Title } from "metabase/ui";

type EmbeddingOptionProps = {
  title: string;
  label?: ReactNode;
  children?: ReactNode;
  description: ReactNode;
  icon: ReactNode;
};

export function EmbeddingOption({
  title,
  label,
  description,
  children,
  icon,
}: EmbeddingOptionProps) {
  const titleId = useUniqueId();
  return (
    <Paper
      maw="40rem"
      w="100%"
      shadow="sm"
      p="2.5rem"
      component="article"
      aria-labelledby={titleId}
    >
      {icon}
      <Flex gap="md" mt="md" mb="sm" direction={"row"} align="center">
        <Title id={titleId} order={2}>
          {title}
        </Title>
        {label}
      </Flex>
      <Text lh={"1.25rem"} mb={"lg"}>
        {description}
      </Text>
      <Flex gap="lg" direction="column" align="flex-start">
        {children}
      </Flex>
    </Paper>
  );
}
