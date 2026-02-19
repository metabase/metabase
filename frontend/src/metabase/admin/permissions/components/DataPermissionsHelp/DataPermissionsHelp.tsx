import { jt, t } from "ttag";

import { PermissionHelpDescription } from "metabase/admin/permissions/components/PermissionHelpDescription";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import {
  Accordion,
  Box,
  Flex,
  Icon,
  List,
  Stack,
  Text,
  Title,
  rem,
} from "metabase/ui";

import { hasPermissionValueInGraph } from "../../utils/graph/data-permissions";

export const DataPermissionsHelp = () => {
  const isAdvancedPermissionsFeatureEnabled = useSelector(
    (state) => getSetting(state, "token-features").advanced_permissions,
  );

  const shouldShowLegacyNoSelfServiceInfo = useSelector((state) =>
    hasPermissionValueInGraph(
      state.admin.permissions.originalDataPermissions,
      DataPermissionValue.LEGACY_NO_SELF_SERVICE,
    ),
  );
  const { url: docsUrl } = useDocsUrl("permissions/data");

  return (
    <Flex direction="column" py={rem(22)} px="1rem">
      <Box px={rem(12)}>
        <Title order={3}>{t`Data permissions`}</Title>
        <Text my="1rem">{t`People can be members of multiple groups, and Metabase grants them the most permissive level of access across all of a person's groups.`}</Text>
      </Box>
      <Accordion
        chevron={<Icon name="chevrondown" size={12} />}
        defaultValue="database-level"
      >
        <Accordion.Item
          value="database-view-data-level"
          data-testid="database-view-data-level"
          hidden={!isAdvancedPermissionsFeatureEnabled}
        >
          <Accordion.Control>{t`Database ‘View data’ levels`}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="1rem" py="1rem">
              <PermissionHelpDescription
                icon="eye"
                iconColor="success"
                name={t`Can view`}
                description={t`The group can view all data for that database.`}
              />
              <PermissionHelpDescription
                icon="permissions_limited"
                iconColor="warning"
                name={t`Granular`}
                description={t`The group can view select schemas and tables. Can be combined with user attributes to enable row and column security to control what data each person can view.`}
              />
              <PermissionHelpDescription
                icon="database"
                iconColor="warning"
                name={t`Impersonated (Pro)`}
                description={t`The group can view data based on the database role you specify with a user attribute (manually or via SSO).`}
              />
              {shouldShowLegacyNoSelfServiceInfo && (
                <PermissionHelpDescription
                  icon="eye"
                  iconColor="accent5"
                  name={t`No self-service (Deprecated)`}
                  description={t`The group can't use the query builder or drill through existing questions. They also can't see the data in the Browse data section. They can still view questions based on this data, if they have permissions to the relevant collection. ‘Blocked‘, ‘Impersonated‘ and ‘Row and column security‘ in another group will override ‘No self-service‘.`}
                />
              )}
              <PermissionHelpDescription
                icon="close"
                iconColor="danger"
                name={t`Blocked (Pro)`}
                description={t`The group cannot view any data from the data source, even if they have collection access to view questions or dashboards that draw from that data.`}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item
          value="schema-table-level"
          data-testid="schema-table-level"
          hidden={!isAdvancedPermissionsFeatureEnabled}
        >
          <Accordion.Control>{t`Schema or table ‘View data’ levels`}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="1rem" py="1rem">
              <PermissionHelpDescription
                icon="check"
                iconColor="success"
                name={t`Can view`}
                description={t`The group can view all data for that schema or table.`}
              />
              {shouldShowLegacyNoSelfServiceInfo && (
                <PermissionHelpDescription
                  icon="eye"
                  iconColor="accent5"
                  name={t`No self-service (Deprecated)`}
                  description={t`"No self-service" works like it does for databases, except here it is scoped to individual schemas or tables.`}
                />
              )}
              <PermissionHelpDescription
                icon="permissions_limited"
                iconColor="brand"
                name={t`Row and column security (Pro)`}
                description={t`Lets you specify row and column-level permissions. Can be set up via user attributes and SSO.`}
              />
              <PermissionHelpDescription
                icon="close"
                iconColor="danger"
                name={t`Blocked (Pro)`}
                description={
                  <>
                    <Text>{t`The group can’t view:`}</Text>
                    <List style={{ marginInlineEnd: "1rem" }}>
                      <List.Item>
                        <Text>{t`The schema/table when browsing data.`}</Text>
                      </List.Item>
                      <List.Item>
                        <Text>
                          {t`Query-builder questions using that schema/table.`}
                        </Text>
                      </List.Item>
                      <List.Item>
                        <Text>
                          {t`ANY native questions querying the database, regardless of schema/table.`}
                        </Text>
                      </List.Item>
                    </List>
                  </>
                }
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item
          value="create-queries-level"
          data-testid="create-queries-level"
        >
          <Accordion.Control>{t`‘Create queries’ levels`}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="1rem" py="1rem">
              <PermissionHelpDescription
                icon="check"
                iconColor="success"
                name={t`Query builder and native`}
                description={t`The group can use both the query builder and the native code editor to create questions and models.`}
              />
              <PermissionHelpDescription
                icon="permissions_limited"
                iconColor="warning"
                name={t`Query builder only`}
                description={t`The group can use the query builder to create questions and models.`}
              />
              <PermissionHelpDescription
                icon="permissions_limited"
                iconColor="warning"
                name={t`Granular`}
                description={t`The group can use the query builder to create questions and models for select schemas and tables.`}
              />

              <PermissionHelpDescription
                icon="close"
                iconColor="danger"
                name={t`No`}
                description={t`The group cannot create or edit questions, including drill-through.`}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item
          value="others"
          hidden={!isAdvancedPermissionsFeatureEnabled}
        >
          <Accordion.Control>{t`Other data permissions`}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="1rem" py="1rem">
              <Text>
                {jt`${(
                  <strong key="permission">{t`Download results (Pro):`}</strong>
                )} The group can download results, up to a maximum number of rows that you set.`}
              </Text>
              <Text>
                {jt`${(
                  <strong key="permission">{t`Manage Data Model (Pro):`}</strong>
                )} The group can edit metadata via the “Table metadata” tab in the Admin settings.`}
              </Text>
              <Text>
                {jt`${(
                  <strong key="permission">{t`Manage Database (Pro):`}</strong>
                )} The group can edit database settings for a given database in the "Database" tab of the Admin settings.`}
              </Text>
              {PLUGIN_TRANSFORMS.isEnabled && (
                <Text>
                  {jt`${(
                    <strong key="permission">{t`Transforms (Pro):`}</strong>
                  )} The group can create, edit, and run Transforms for a given database.`}
                </Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Text component="footer" ta="center" py="1.5rem" fw={600}>
        {jt`${(
          <ExternalLink key="link" href={docsUrl}>{t`Learn more`}</ExternalLink>
        )} about data permissions`}
      </Text>
    </Flex>
  );
};
