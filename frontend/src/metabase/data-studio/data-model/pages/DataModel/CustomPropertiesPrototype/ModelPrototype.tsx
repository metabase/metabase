import { t } from "ttag";

import { useGetDatabaseQuery } from "metabase/api";
import {
  type RegistryProperty,
  conformsToType,
  getPropertyBaseType,
  usePivotModelById,
  usePropertyRegistry,
  usePropertySampleRows,
} from "metabase/metadata/table-structure";
import { useParams } from "metabase/router";
import { Badge, Box, Group, Icon, Loader, Stack, Title } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries, RowValue, Table } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { pivotSampleRows } from "../TableSection/CustomProperties/pivot-preview";

import { WAREHOUSE_ID } from "./fixtures";

const toTypedValue = (
  property: RegistryProperty,
  value: string | undefined,
): RowValue => {
  if (value == null || !conformsToType(value, property.type)) {
    return null;
  }
  if (property.type === "integer" || property.type === "decimal") {
    return Number(value);
  }
  if (property.type === "boolean") {
    return value.toLowerCase() === "true";
  }
  return value;
};

export function ModelPrototype() {
  const { slug } = useParams();
  const model = usePivotModelById(parseInt(slug ?? "", 10));
  const { data: database } = useGetDatabaseQuery({
    id: WAREHOUSE_ID,
    include: "tables.fields",
  });
  const table = database?.tables?.find(({ id }) => id === model?.tableId);

  if (!model || !table) {
    return <Loader />;
  }
  return (
    <ModelTable
      name={model.name}
      table={table}
      propertyKeys={model.propertyKeys}
    />
  );
}

function ModelTable({
  name,
  table,
  propertyKeys,
}: {
  name: string;
  table: Table;
  propertyKeys: string[];
}) {
  const state = usePropertyRegistry(table);
  const samples = usePropertySampleRows(table);
  if (state.status !== "loaded" || !samples) {
    return <Loader />;
  }
  const properties = state.registry.properties.filter(({ key }) =>
    propertyKeys.includes(key),
  );
  const entities = pivotSampleRows(samples, state.registry.properties);
  const series: RawSeries = [
    {
      card: createMockCard({ name, display: "table", type: "model" }),
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "customer_id",
            display_name: t`Customer ID`,
            base_type: "type/Integer",
            semantic_type: "type/PK",
          }),
          ...properties.map((property) =>
            createMockColumn({
              name: property.name,
              display_name: property.displayName,
              base_type: getPropertyBaseType(property.type),
              semantic_type: property.semanticType,
            }),
          ),
        ],
        rows: entities.map((entity) => [
          entity.entityKey,
          ...properties.map((property) =>
            toTypedValue(property, entity.valuesByProperty.get(property.key)),
          ),
        ]),
      }),
    },
  ];

  return (
    <Stack h="100vh" gap={0} bg="background_page-primary">
      <Group
        px="xl"
        py="md"
        gap="sm"
        style={{ borderBottom: "1px solid var(--mb-color-border-neutral)" }}
      >
        <Icon name="model" c="text-brand" />
        <Title order={3}>{name}</Title>
        <Badge variant="light">{t`Model`}</Badge>
      </Group>
      <Box flex={1} p="xl">
        <Visualization rawSeries={series} />
      </Box>
    </Stack>
  );
}
