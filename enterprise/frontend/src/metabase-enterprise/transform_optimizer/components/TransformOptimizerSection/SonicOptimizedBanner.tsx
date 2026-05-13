import { t } from "ttag";

import { Box, Button, Group, Stack, Text } from "metabase/ui";

// Drop the gif file at this path: resources/frontend_client/app/assets/img/sonic-gotta-go-fast.gif
const SONIC_GIF_URL = "app/assets/img/sonic-gotta-go-fast.gif";

type SonicOptimizedBannerProps = {
  summary?: string;
  onReanalyze: () => void;
};

export function SonicOptimizedBanner({
  summary,
  onReanalyze,
}: SonicOptimizedBannerProps) {
  return (
    <Stack
      align="center"
      gap="sm"
      p="lg"
      bg="bg-light"
      style={{ borderRadius: "var(--mantine-radius-md)" }}
    >
      <Box
        component="img"
        src={SONIC_GIF_URL}
        alt={t`Sonic running fast — this transform is optimized`}
        h={160}
        style={{ objectFit: "contain" }}
      />
      <Text fw="bold" fz="lg">{t`This transform is fully optimized!`}</Text>
      {summary && (
        <Text c="text-secondary" ta="center">
          {summary}
        </Text>
      )}
      <Group justify="center" mt="sm">
        <Button variant="subtle" onClick={onReanalyze}>
          {t`Re-analyze`}
        </Button>
      </Group>
    </Stack>
  );
}
