import { jt, t } from "ttag";

import { PermissionHelpDescription } from "metabase/admin/permissions/components/PermissionHelpDescription";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Flex, Stack, Text, Title, rem } from "metabase/ui";

export const CollectionPermissionsHelp = () => {
  const { url } = useDocsUrl("permissions/collection");

  return (
    <Flex direction="column" py={rem(22)} px="lg">
      <Title order={3}>{t`Collection permissions`}</Title>
      <Text my="1rem">{t`People can be members of multiple groups, and Metabase grants them the most permissive level of access across all of a person's groups.`}</Text>

      <Title order={6} my="sm">{t`Collections Permission Levels`}</Title>

      <Stack gap={16} mt="1rem">
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

      <Text component="footer" ta="center" py={24} fw={600}>
        {jt`${(
          <ExternalLink key="link" href={url}>{t`Learn more`}</ExternalLink>
        )} about collection permissions`}
      </Text>
    </Flex>
  );
};
