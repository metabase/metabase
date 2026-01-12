import { c, t } from "ttag";

import Link from "metabase/common/components/Link";
import { Anchor, Box, Button, Flex, Text } from "metabase/ui";

export const TenantsListingEmptyState = ({
  onCreateTenant,
}: {
  onCreateTenant: () => void;
}) => (
  <Flex justify="space-between" align="center" gap="lg">
    <Box flex="1">
      <Text size="md" c="text-primary">
        {c(
          "{0} links to external users, {1} links to groups, {2} links to permissions",
        ).jt`Create your first tenant to start adding ${(
          <Anchor
            component={Link}
            to="/admin/people/tenants/people"
            key="external-users-link"
          >{t`external users`}</Anchor>
        )} to it, and organize these users into ${(<Anchor component={Link} to="/admin/people/tenants/groups" key="tenant-groups-link">{t`groups`}</Anchor>)} to assign ${(
          <Anchor
            component={Link}
            to="/admin/permissions"
            key="permissions-link"
          >{t`permissions`}</Anchor>
        )}. Then, create dashboards, charts and models for your tenants in shared collections.`}
      </Text>
    </Box>

    <Button variant="filled" onClick={onCreateTenant}>
      {t`Create your first tenant`}
    </Button>
  </Flex>
);
