import { Flex, Icon, Title, Text, Anchor } from "metabase/ui";
import { Dashboard, Table } from "metabase-types/api";
import { TablesGrid } from "./TablesGrid";
import * as Urls from "metabase/lib/urls";

export const BlueprintContentCard = ({
  dashboard,
  tables,
}: {
  dashboard: Dashboard;
  tables: Table[];
}) => {
  return (
    <>
      <Anchor href={Urls.dashboard(dashboard)} td="none">
        <Flex
          w="100%"
          bg="bg-white"
          p="md"
          bdrs="12px"
          style={{
            border: "1px solid var(--mb-color-border)",
          }}
          direction="row"
        >
          <Icon name="dashboard" size={24} c="rgba(53, 140, 217, 1)" mr="sm" />
          <Flex direction="column">
            <Title
              order={4}
              mb="sm"
              c="text-primary"
              fz={17}
              fw={400}
              lh="20px"
            >
              {dashboard.name}
            </Title>
            <Text fz={14} lh="14px" fw={400} c="text-secondary">
              {dashboard.description}
            </Text>
          </Flex>
        </Flex>
      </Anchor>
      <TablesGrid tables={tables} />
    </>
  );
};
