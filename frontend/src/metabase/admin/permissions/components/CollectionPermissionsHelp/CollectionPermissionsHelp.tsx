import { t, jt } from "ttag";

import { Flex, Stack, Text, Title } from "metabase/ui";
import MetabaseSettings from "metabase/lib/settings";

import ExternalLink from "metabase/core/components/ExternalLink";
import { PermissionHelpDescription } from "metabase/admin/permissions/components/PermissionHelpDescription";

export const CollectionPermissionsHelp = () => (
  <Flex direction="column" py="1.375rem" px="1.5rem">
    <Title order={4}>{t`Collection permissions`}</Title>
    <Text my="1rem">{t`People can be members of multiple groups, and Metabase grants them the most permissive level of access across all of a person's groups.`}</Text>

    <Title order={6} my="0.5rem">{t`Collections Permission Levels`}</Title>

    <Stack spacing={16} mt="1rem">
      <PermissionHelpDescription
        icon="check"
        iconColor="success"
        name={t`Curate`}
        description={t`The group can view, save, edit, pin, and archive items in the collection.`}
      />

      <PermissionHelpDescription
        icon="permissions_limited"
        iconColor="warning"
        name={t`View`}
        description={t`The group can view items in a collection.`}
      />

      <PermissionHelpDescription
        icon="close"
        iconColor="error"
        name={t`No access`}
        description={t`The group won't even see the collection listed.`}
      />
    </Stack>

    <Text component="footer" align="center" py={24} weight={600}>
      {jt`${(
        <ExternalLink
          href={MetabaseSettings.docsUrl("permissions/collections")}
        >{t`Learn more`}</ExternalLink>
      )} about collection permissions`}
    </Text>
  </Flex>
);
