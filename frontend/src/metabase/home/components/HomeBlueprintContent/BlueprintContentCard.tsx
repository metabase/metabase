import { Flex, Icon, Title, Text, Anchor } from "metabase/ui";
import { Dashboard, Document, Table } from "metabase-types/api";
import { TablesGrid } from "./TablesGrid";
import * as Urls from "metabase/lib/urls";

const EntityCard = ({
  type,
  entity,
}:
  | { entity: Dashboard; type: "dashboard" }
  | { entity: Document; type: "document" }) => {
  const url =
    type === "dashboard" ? Urls.dashboard(entity) : Urls.document(entity);
  return (
    <Anchor href={url} td="none" w="100%" h="100%">
      <Flex
        bg="bg-white"
        p="md"
        bdrs="12px"
        h="100%"
        style={{
          border: "1px solid var(--mb-color-border)",
        }}
        direction="row"
      >
        <Icon
          name={type === "dashboard" ? "dashboard" : "document"}
          size={24}
          c="rgba(53, 140, 217, 1)"
          mr="sm"
        />
        <Flex direction="column">
          <Title order={4} mb="sm" c="text-primary" fz={17} fw={400} lh="20px">
            {entity.name}
          </Title>
          {type === "dashboard" && (
            <Text fz={14} lh="14px" fw={400} c="text-secondary" truncate>
              {entity.description}
            </Text>
          )}
        </Flex>
      </Flex>
    </Anchor>
  );
};

export const BlueprintContentCard = ({
  dashboard,
  document,
  tables,
}: {
  dashboard?: Dashboard;
  document?: Document;
  tables: Table[];
}) => {
  return (
    <>
      <Flex direction="row" gap="md" align="stretch">
        {dashboard && (
          <Flex style={{ flex: 1 }}>
            <EntityCard entity={dashboard} type="dashboard" />
          </Flex>
        )}
        {document && (
          <Flex style={{ flex: 1 }}>
            <EntityCard entity={document} type="document" />
          </Flex>
        )}
      </Flex>
      <TablesGrid tables={tables} />
    </>
  );
};
