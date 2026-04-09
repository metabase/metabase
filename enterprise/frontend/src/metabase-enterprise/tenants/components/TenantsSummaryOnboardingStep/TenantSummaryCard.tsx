import type { ReactNode } from "react";
import { t } from "ttag";

import { Grid, Paper, Stack, Text, Title } from "metabase/ui";

export const TenantSummaryCard = ({
  name,
  slug,
  isolationFieldLabel,
  isolationFieldValue,
  dataPermissionsDescription,
}: {
  name: string;
  slug: string;
  isolationFieldLabel: string | null;
  isolationFieldValue: string | null;
  dataPermissionsDescription: ReactNode;
}) => {
  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md">
        <Title order={4} c="text-primary">
          {name}
        </Title>

        <Grid>
          {isolationFieldLabel && (
            <Grid.Col span={4}>
              <Stack gap={4}>
                <Text size="xs" c="text-secondary">
                  {isolationFieldLabel}
                </Text>

                <Text size="sm" fw="bold" c="text-primary">
                  {isolationFieldValue ?? "-"}
                </Text>
              </Stack>
            </Grid.Col>
          )}

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

          {dataPermissionsDescription && (
            <Grid.Col span={4}>
              <Stack gap={4}>
                <Text size="xs" c="text-secondary">
                  {t`Data permissions`}
                </Text>

                <Text size="sm" c="text-primary">
                  {dataPermissionsDescription}
                </Text>
              </Stack>
            </Grid.Col>
          )}
        </Grid>
      </Stack>
    </Paper>
  );
};
