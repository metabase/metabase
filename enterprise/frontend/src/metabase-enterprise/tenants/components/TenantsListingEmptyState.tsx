import { t } from "ttag";

import { Anchor, Box, Button, Flex, Text } from "metabase/ui";

export const TenantsListingEmptyState = ({
  onCreateTenant,
}: {
  onCreateTenant: () => void;
}) => (
  <Flex justify="space-between" align="flex-start" gap="lg">
    <Box flex="1">
      <Text size="md" c="text-dark" mb="md">
        {t`Create your first tenant to start adding`}{" "}
        <Anchor href="/admin/tenants/people">{t`external users`}</Anchor>
        {t` to it, and organize these users into `}
        <Anchor href="/admin/tenants/groups">{t`groups`}</Anchor>
        {t` to assign `}
        <Anchor href="/admin/permissions">{t`permissions`}</Anchor>.
      </Text>
      <Text size="md" c="text-dark">
        {t`Then, create dashboards and charts for each tenant in their tenant collection. Check out an `}
        <Anchor href="#!" target="_blank" rel="noopener noreferrer">
          {t`example tenant collection`}
        </Anchor>
        .
      </Text>
    </Box>

    <Flex h="100%" justify="center" align="center">
      <Button variant="filled" onClick={onCreateTenant}>
        {t`Create your first tenant`}
      </Button>
    </Flex>
  </Flex>
);
