import { jt, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Flex, Stack, Text, Title, rem } from "metabase/ui";

export const ApplicationPermissionsHelp = () => {
  const { url } = useDocsUrl("permissions/application");
  return (
    <Flex direction="column" py={rem(22)} px="lg">
      <Title order={4}>{t`Applications permissions`}</Title>
      <Text my="1rem">{t`People can be members of multiple groups, and Metabase grants them the most permissive level of access across all of a person's groups.`}</Text>

      <Title order={5}>{t`Applications permissions`}</Title>

      <Stack gap={10} mt="sm">
        <Text>{t`Application settings are useful for granting groups access to some, but not all, of Metabase’s administrative features.`}</Text>
        <Text>
          {jt`${(
            <strong>{t`Settings:`}</strong>
          )} the group can access the Settings tab in the Admin panel.`}
        </Text>
        <Text>
          {jt`${(
            <strong>{t`Monitoring:`}</strong>
          )} monitoring access grants permissions to the Tools, Auditing, and Troubleshooting tabs in the Admin panel.`}
        </Text>
        <Text>
          {jt`${(
            <strong>{t`Subscriptions and alerts:`}</strong>
          )} the group can create dashboard subscriptions and alerts.`}
        </Text>
      </Stack>

      <Text component="footer" ta="center" py="1rem" fw={600}>
        {jt`${(
          <ExternalLink href={url}>{t`Learn more`}</ExternalLink>
        )} about application permissions`}
      </Text>
    </Flex>
  );
};
