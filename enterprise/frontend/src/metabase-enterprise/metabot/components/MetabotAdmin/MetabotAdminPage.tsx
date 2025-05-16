import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { Table } from "metabase/common/components/Table";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { getIcon } from "metabase/lib/icon";
import { Box, Button, Flex, Icon, Stack, Text} from "metabase/ui";

export function MetabotAdminPage() {
  return (
    <Flex p="xl">
      <MetabotNavPane />
      <Stack px="xl">
        <SettingHeader
          id="configure-metabot"
          title={t`Configure Metabot`}
          // eslint-disable-next-line no-literal-metabase-strings -- admin settings
          description={t`Metabot is Metabase's AI agent. To help Metabot more easily find and focus on the data you care about most, select the models and metrics it should be able to use to create queries.`}
        />

        <SettingHeader
          id="allow-metabot"
          title={t`Items Metabot is allowed to use`}
        />
        <Flex gap="md">
          <Text fw="bold">
            X items
          </Text>
          <Text>
            {t`We recommend keeping this to no more than 30.`}
          </Text>
        </Flex>
        <Box>
          <Button variant="filled">
            {t`Add items`}
          </Button>
        </Box>
        <MetabotEntitiesTable />
      </Stack>
    </Flex>
  );
}

function MetabotNavPane() {
  return (
    <Flex direction="column" w="266px" flex="0 0 auto">
      <LeftNavPane>
        <LeftNavPaneItem name={t`Internal Metabot`} path="/admin/metabot/1" index />
        <LeftNavPaneItem name={t`Embedded Metabot`} path="/admin/metabot/2" />
      </LeftNavPane>
    </Flex>
  );
}

function MetabotEntitiesTable() {
  return (
    <Table
      columns={[
        { key: "item", name: t`Item` },
        { key: "location", name: t`Location` },
        { key: "delete", name: t`` },
      ]}
      rows={[
        {
          name: "My Model",
          model: "dataset",
          location: "My Collection",
        },
        {
          name: "My Metric",
          model: "metric",
          location: "My Other Collection",
        },
        {
          name: "My Other Metric",
          model: "metric",
          location: "My Collection",
        },
        {
          name: "My other Model",
          model: "dataset",
          location: "My Collection",
        },
      ] as any}
      rowRenderer={(row) => (
        <tr key={row.id}>
          <td style={{ padding: "8px 16px" }}>
            <Flex align="center" gap="sm">
              <Icon {...getIcon(row)} />
              <Text>{row.name}</Text>
            </Flex>
          </td>
          <td style={{ padding: "8px 16px" }}>
            <Flex align="center" gap="sm">
              <Icon name="folder" />
              {row.location}
            </Flex>
          </td>
          <td style={{ padding: "8px" }}>
            <Flex justify="end">
              <Button variant="subtle">
                <Icon name="trash" />
              </Button>
            </Flex>
          </td>
        </tr>
      )}
    />
  );
}