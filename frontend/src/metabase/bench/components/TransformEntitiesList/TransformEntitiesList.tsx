import { ActionIcon, Group, Text } from "metabase/ui";
import { Icon } from "metabase/ui";

interface TransformEntity {
  id: string;
  name: string;
  type: "model" | "table" | "query";
}

const mockTransformEntities: TransformEntity[] = [
  { id: "1", name: "user_metrics", type: "model" },
  { id: "2", name: "sales_data", type: "table" },
  { id: "3", name: "revenue_analysis", type: "query" },
  { id: "4", name: "customer_segments", type: "model" },
  { id: "5", name: "product_performance", type: "query" },
];

const getEntityIcon = (type: TransformEntity["type"]) => {
  switch (type) {
    case "model":
      return "model";
    case "table":
      return "table";
    case "query":
      return "insight";
    default:
      return "document";
  }
};

export function TransformEntitiesList() {
  return (
    <>
      {mockTransformEntities.map((entity) => (
        <Group
          key={entity.id}
          p="xs"
          style={{
            borderRadius: "4px",
            cursor: "pointer",
            ":hover": {
              backgroundColor: "var(--mantine-color-gray-1)",
            },
          }}
        >
          <ActionIcon variant="subtle" size="sm">
            <Icon name={getEntityIcon(entity.type)} />
          </ActionIcon>
          <Text size="sm" style={{ flex: 1 }}>
            {entity.name}
          </Text>
          <Text size="xs" c="dimmed">
            {entity.type}
          </Text>
        </Group>
      ))}
    </>
  );
}
