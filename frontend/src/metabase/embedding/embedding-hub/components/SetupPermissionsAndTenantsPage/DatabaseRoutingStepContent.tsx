/* eslint-disable metabase/no-unconditional-metabase-links-render */

import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Button, Group, Icon, Paper, Stack, Text, Title } from "metabase/ui";

export const DatabaseRoutingStepContent = () => {
  const { url: docsUrl } = useDocsUrl("permissions/database-routing", {
    utm: { utm_content: "embedding-hub" },
  });

  return (
    <Stack>
      <Text c="text-secondary" lh="xl" mt="xs">
        {t`Follow the steps in the documentation to manage data permissions with database routing.`}
      </Text>

      <Paper bg="background-brand" p="lg" radius="md" withBorder>
        <Stack gap="sm">
          <Title order={4} c="text-primary">
            {t`Manage data permissions with database routing`}
          </Title>

          <Text c="text-secondary" lh="xl">
            {t`Follow the guide in the docs to enable database routing at the data source level, add destination databases and configure the relevant tenant attributes.`}
          </Text>

          <Group justify="flex-end">
            <Button
              component={ExternalLink}
              href={docsUrl}
              variant="outline"
              rightSection={<Icon name="external" size={16} />}
              mt="sm"
            >
              {t`View the guide`}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
};
