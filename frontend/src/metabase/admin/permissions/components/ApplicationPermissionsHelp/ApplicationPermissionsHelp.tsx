import { t, jt } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import { rem, Flex, Stack, Text, Title } from "metabase/ui";

export const ApplicationPermissionsHelp = () => (
  <Flex direction="column" py={rem(22)} px="lg">
    <Title order={4}>{t`Applications permissions`}</Title>
    <Text my="1rem">{t`People can be members of multiple groups, and Metabase grants them the most permissive level of access across all of a person's groups.`}</Text>

    <Title order={5}>{t`Applications permissions`}</Title>

    <Stack spacing={10} mt="sm">
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

    <Text component="footer" align="center" py="1rem" weight={600}>
      {jt`${(
        <ExternalLink
          href={MetabaseSettings.docsUrl("permissions/application")}
        >{t`Learn more`}</ExternalLink>
      )} about application permissions`}
    </Text>
  </Flex>
);
