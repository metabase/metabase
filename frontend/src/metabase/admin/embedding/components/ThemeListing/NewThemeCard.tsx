import { t } from "ttag";

import { Card, Icon, Stack, Text } from "metabase/ui";

import S from "./NewThemeCard.module.css";

interface NewThemeCardProps {
  onClick: () => void;
}

export function NewThemeCard({ onClick }: NewThemeCardProps) {
  return (
    <Card
      withBorder
      component="button"
      type="button"
      p={0}
      onClick={onClick}
      className={S.card}
      h={301}
    >
      <Stack className={S.overlay} align="center" justify="center" gap="xs">
        <Icon name="add" c="brand" size={24} />
        <Text c="brand" fw={500}>{t`New theme`}</Text>
      </Stack>
    </Card>
  );
}
