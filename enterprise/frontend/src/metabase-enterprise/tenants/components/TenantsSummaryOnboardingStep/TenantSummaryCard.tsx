import { t } from "ttag";

import { Grid, Paper, Stack, Text, Title } from "metabase/ui";

export const TenantSummaryCard = ({
  name,
  slug,
  tenantIdentifier,
}: {
  name: string;
  slug: string;
  tenantIdentifier: string | null;
}) => {
  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md">
        <Title order={4} c="text-primary">
          {name}
        </Title>

        <Grid>
          <Grid.Col span={4}>
            <Stack gap={4}>
              <Text size="xs" c="text-secondary">
                {t`tenant_identifier`}
              </Text>

              <Text size="sm" fw="bold" c="text-primary">
                {tenantIdentifier ?? "-"}
              </Text>
            </Stack>
          </Grid.Col>

          <Grid.Col span={4}>
            <Stack gap={4}>
              <Text size="xs" c="text-secondary">
                {t`Tenant slug`}
              </Text>

              <Text size="sm" fw="bold" c="text-primary">
                {slug}
              </Text>
            </Stack>
          </Grid.Col>

          <Grid.Col span={4}>
            <Stack gap={4}>
              <Text size="xs" c="text-secondary">
                {t`Data permissions`}
              </Text>

              <Text size="sm" c="text-primary">
                {/* TODO(EMB-1268): Add data permissions info when available */}
                {t`Configured via data segregation`}
              </Text>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Paper>
  );
};
