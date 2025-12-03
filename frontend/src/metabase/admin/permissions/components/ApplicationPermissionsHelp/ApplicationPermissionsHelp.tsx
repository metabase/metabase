import { jt, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";
import { Flex, Stack, Text, Title, rem } from "metabase/ui";

const PERMISSION_HELP_TEXT: Record<
  string,
  { label: () => string; text: () => string }
> = {
  setting: {
    label: () => t`Settings:`,
    text: () => t`the group can access the Settings tab in the Admin panel.`,
  },
  monitoring: {
    label: () => t`Monitoring:`,
    text: () =>
      t`monitoring access grants permissions to the Tools, Auditing, and Troubleshooting tabs in the Admin panel.`,
  },
  subscription: {
    label: () => t`Subscriptions and alerts:`,
    text: () => t`the group can create dashboard subscriptions and alerts.`,
  },
  "data-studio": {
    label: () => t`Data Studio:`,
    text: () =>
      t`the group can access the Data Studio to manage curated assets.`,
  },
};

export const ApplicationPermissionsHelp = () => {
  const { url } = useDocsUrl("permissions/application");
  const registeredPermissions = PLUGIN_APPLICATION_PERMISSIONS.permissions;

  return (
    <Flex direction="column" py={rem(22)} px="lg">
      <Title order={3}>{t`Applications permissions`}</Title>
      <Text my="1rem">{t`People can be members of multiple groups, and Metabase grants them the most permissive level of access across all of a person's groups.`}</Text>

      <Title order={6} my="sm">{t`Applications permissions`}</Title>

      <Stack gap={10} mt="sm">
        <Text>{t`Application settings are useful for granting groups access to some, but not all, of Metabase's administrative features.`}</Text>
        {registeredPermissions.map((permDef) => {
          const help = PERMISSION_HELP_TEXT[permDef.key];
          if (!help) {
            return null;
          }
          return (
            <Text key={permDef.key}>
              {jt`${(<strong key="label">{help.label()}</strong>)} ${help.text()}`}
            </Text>
          );
        })}
      </Stack>

      <Text component="footer" ta="center" py="1rem" fw={600}>
        {jt`${(
          <ExternalLink key="link" href={url}>{t`Learn more`}</ExternalLink>
        )} about application permissions`}
      </Text>
    </Flex>
  );
};
