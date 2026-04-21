import { t } from "ttag";

import { Box, Card, Flex, Icon, Stack, Text } from "metabase/ui";

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
    >
      {/* Invisible spacers mirroring the sibling card (square preview + name row). */}
      <Box className={S.previewSpacer} aria-hidden />
      <Flex align="center" px="md" py="sm" aria-hidden>
        <Text fz="lg">&nbsp;</Text>
      </Flex>

      <Stack className={S.overlay} align="center" justify="center" gap="xs">
        <Icon name="add" c="brand" size={24} />
        <Text c="brand" fw={500}>{t`New theme`}</Text>
      </Stack>
    </Card>
  );
}
