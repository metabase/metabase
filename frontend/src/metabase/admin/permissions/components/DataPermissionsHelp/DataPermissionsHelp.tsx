import { t, jt } from "ttag";

import { Accordion, Box, Flex, Stack, Text, Title } from "metabase/ui";
import MetabaseSettings from "metabase/lib/settings";

import { Icon } from "metabase/core/components/Icon";
import ExternalLink from "metabase/core/components/ExternalLink";
import { PermissionHelpDescription } from "metabase/admin/permissions/components/PermissionHelpDescription";
import { getLimitedPermissionAvailabilityMessage } from "metabase/admin/permissions/constants/messages";
import { getSetting } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";

export const DataPermissionsHelp = () => {
  const isAdvancedPermissionsFeatureEnabled = useSelector(
    state => getSetting(state, "token-features").advanced_permissions,
  );

  return (
    <Flex direction="column" py="1.375rem" px="1rem">
      <Box px="0.75rem">
        <Title order={4}>{t`Data permissions`}</Title>
        <Text my="1rem">{t`People can be members of multiple groups, and Metabase grants them the most permissive level of access across all of a person's groups.`}</Text>
      </Box>

      <Accordion
        chevron={<Icon name="chevrondown" size={12} />}
        defaultValue="database-level"
      >
        <Accordion.Item value="database-level">
          <Accordion.Control>Database levels</Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="1rem" py="1rem">
              <PermissionHelpDescription
                icon="check"
                iconColor="success"
                name={t`Unrestricted`}
                description={t`The group can use the query builder to ask questions of any table in the database.`}
              />

              <PermissionHelpDescription
                icon="permissions_limited"
                iconColor="warning"
                name={t`Granular`}
                description={t`The group can only use the query builder to ask questions of specific tables.`}
              />

              <PermissionHelpDescription
                hasUpgradeNotice={!isAdvancedPermissionsFeatureEnabled}
                icon="database"
                iconColor="warning"
                name={t`Impersonated (Pro)`}
                description={t`Impersonation associates a Metabase group with database-defined roles and their privileges. Metabase queries made by this group will respect the grants given to the database roles. You can use impersonation to give a group access to the native/SQL editor, while restricting the group's access to data based on a specific database role.`}
              />

              <PermissionHelpDescription
                icon="eye_crossed_out"
                iconColor="accent5"
                name={t`No self-service`}
                description={t`The group can't use the query builder or drill through existing questions. They also can't see the data in the Browse data section. They can still view questions based on this data, if they have permissions to the relevant collection.`}
              />

              <PermissionHelpDescription
                hasUpgradeNotice={!isAdvancedPermissionsFeatureEnabled}
                icon="close"
                iconColor="danger"
                name={t`Block (Pro)`}
                description={t`The group can't see questions based on this the data, even if they have collection permissions to view the questions. People in a blocked group would need to be in another group with both collection permissions and data permissions in order to view the item.`}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="schema-table-level">
          <Accordion.Control>Schema and table levels</Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="1rem" py="1rem">
              <PermissionHelpDescription
                icon="check"
                iconColor="success"
                name={t`Unrestricted`}
              />

              <PermissionHelpDescription
                icon="eye_crossed_out"
                iconColor="accent5"
                name={t`No self-service`}
                description={t`"Unrestricted" and "No self-service permissions" work like they do for databases, except here they're scoped to individual schemas or tables.`}
              />

              <PermissionHelpDescription
                hasUpgradeNotice={!isAdvancedPermissionsFeatureEnabled}
                icon="permissions_limited"
                iconColor="brand"
                name={t`Sandboxed (Pro)`}
                description={t`Let's you specify row and column-level permissions. Can be set up via user attributes and SSO.`}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="others">
          <Accordion.Control>Other data permissions</Accordion.Control>
          <Accordion.Panel>
            <Stack spacing="1rem" py="1rem">
              <Text>
                {jt`${(
                  <strong>{t`Native query editing:`}</strong>
                )} Extends the "Unrestricted" data permissions level to include access to the native/SQL editor.`}
              </Text>
              <Text>
                {jt`${(
                  <strong>{t`Download results (Pro):`}</strong>
                )} Allows the group to download results, and sets the maximum number of rows they can export.`}{" "}
                {!isAdvancedPermissionsFeatureEnabled &&
                  getLimitedPermissionAvailabilityMessage()}
              </Text>
              <Text>
                {jt`${(
                  <strong>{t`Manage Data Model (Pro):`}</strong>
                )} The group can edit table metadata in the Admin panel.`}{" "}
                {!isAdvancedPermissionsFeatureEnabled &&
                  getLimitedPermissionAvailabilityMessage()}
              </Text>
              <Text>
                {jt`${(
                  <strong>{t`Manage Database (Pro):`}</strong>
                )} Grants a group access to the Admin settings page for a given database (i.e., the page at Admin settings > Databases > your database).`}{" "}
                {!isAdvancedPermissionsFeatureEnabled &&
                  getLimitedPermissionAvailabilityMessage()}
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Text component="footer" align="center" py="1.5rem" weight={600}>
        {jt`${(
          <ExternalLink
            href={MetabaseSettings.docsUrl("permissions/data")}
          >{t`Learn more`}</ExternalLink>
        )} about data permissions`}
      </Text>
    </Flex>
  );
};
