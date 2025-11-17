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
        align={
          type === "dashboard" && !entity.description ? "center" : undefined
        }
      >
        <Icon
          name={type === "dashboard" ? "dashboard" : "document"}
          size={24}
          c="rgba(53, 140, 217, 1)"
          mr="sm"
          style={{ flexShrink: 0 }}
        />
        <Flex direction="column" style={{ minWidth: 0, flex: 1 }}>
          <Title
            order={4}
            mb={type === "dashboard" && entity.description ? "sm" : undefined}
            c="text-primary"
            fz={17}
            fw={400}
            lh="20px"
            lineClamp={1}
          >
            {entity.name}
          </Title>
          {type === "dashboard" && entity.description && (
            <Text fz={14} lh="14px" fw={400} c="text-secondary" lineClamp={1}>
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
