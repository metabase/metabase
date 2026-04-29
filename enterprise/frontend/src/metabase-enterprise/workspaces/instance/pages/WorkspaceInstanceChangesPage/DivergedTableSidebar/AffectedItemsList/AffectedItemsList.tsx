import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  Anchor,
  Ellipsified,
  FixedSizeIcon,
  Group,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type {
  WorkspaceDependent,
  WorkspaceDependentEntityType,
  WorkspaceDivergedTable,
} from "metabase-types/api";

type AffectedItemsListProps = {
  table: WorkspaceDivergedTable;
};

export function AffectedItemsList({ table }: AffectedItemsListProps) {
  return (
    <Stack gap="xs">
      {table.dependents.map((dependent) => (
        <AffectedItemRow
          key={`${dependent.entity_type}-${dependent.id}`}
          dependent={dependent}
          table={table}
        />
      ))}
    </Stack>
  );
}

type AffectedItemRowProps = {
  dependent: WorkspaceDependent;
  table: WorkspaceDivergedTable;
};

function AffectedItemRow({ dependent, table }: AffectedItemRowProps) {
  const href = getDependentHref(dependent, table);
  const icon = getEntityIcon(dependent.entity_type);
  const typeLabel = getEntityTypeLabel(dependent.entity_type);

  return (
    <Group
      align="center"
      gap="sm"
      wrap="nowrap"
      miw={0}
      justify="space-between"
    >
      <Group gap="sm" wrap="nowrap" miw={0} flex={1}>
        <FixedSizeIcon name={icon} />
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          {href != null ? (
            <Anchor component={ForwardRefLink} to={href} target="_blank">
              {dependent.name}
            </Anchor>
          ) : (
            dependent.name
          )}
        </Ellipsified>
      </Group>
      <Text c="text-secondary" fz="sm">
        {typeLabel}
      </Text>
    </Group>
  );
}

function getDependentHref(
  dependent: WorkspaceDependent,
  table: WorkspaceDivergedTable,
): string | null {
  switch (dependent.entity_type) {
    case "transform":
      return Urls.transform(dependent.id);
    case "question":
    case "model":
    case "metric":
      return Urls.question({
        id: dependent.id,
        name: dependent.name,
        type: dependent.entity_type,
      });
    case "segment":
      if (table.table_id == null) {
        return null;
      }
      return Urls.dataStudioDataModelSegment({
        databaseId: table.database_id,
        schemaName: table.schema,
        tableId: table.table_id,
        segmentId: dependent.id,
      });
    case "measure":
      if (table.table_id == null) {
        return null;
      }
      return Urls.dataStudioDataModelMeasure({
        databaseId: table.database_id,
        schemaName: table.schema,
        tableId: table.table_id,
        measureId: dependent.id,
      });
  }
}

function getEntityIcon(entityType: WorkspaceDependentEntityType): IconName {
  switch (entityType) {
    case "question":
      return "table2";
    case "model":
      return "model";
    case "metric":
      return "metric";
    case "segment":
      return "segment";
    case "measure":
      return "ruler";
    case "transform":
      return "transform";
  }
}

function getEntityTypeLabel(entityType: WorkspaceDependentEntityType): string {
  switch (entityType) {
    case "question":
      return t`Question`;
    case "model":
      return t`Model`;
    case "metric":
      return t`Metric`;
    case "segment":
      return t`Segment`;
    case "measure":
      return t`Measure`;
    case "transform":
      return t`Transform`;
  }
}
