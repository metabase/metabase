import type { ReactNode } from "react";

import { Card, Stack, Text } from "metabase/ui";

import S from "./TitledSection.module.css";

interface Props {
  children?: ReactNode;
  title?: string;
}

export const TitledSection = ({ children, title }: Props) => {
  return (
    <Card className={S.card} p="lg" pt="md" withBorder>
      <Stack gap="lg">
        {title != null ? (
          <Text c="text-secondary" fw="bold" size="sm">
            {title}
          </Text>
        ) : null}

        {children}
      </Stack>
    </Card>
  );
};
