import { t } from "ttag";

import type { ColumnOptions } from "metabase/data-grid/types";
import type {
  UnreferencedItem,
  UnreferencedItemSortColumn,
} from "metabase-types/api";

import type { EntityTypeFilterValue } from "../../../components/TasksFilterButton";
import { EntityCell, LinkCell, TextCell } from "../../../components/TasksTable";
import { EMPTY_VALUE } from "../constants";

import {
  formatDate,
  getCollectionInfo,
  getCreatedDate,
  getCreatorName,
  getDatabaseInfo,
  getItemIcon,
  getItemName,
  getItemUrl,
  getLastModifiedByName,
  getLastModifiedDate,
  getLastRunDate,
  getOwnerName,
  getSchemaInfo,
  getTargetTableInfo,
  getViewCount,
} from "./utils";

export type ColumnId =
  | "name"
  | "creator"
  | "owner"
  | "collection"
  | "database"
  | "schema"
  | "createdAt"
  | "lastUpdated"
  | "lastModifiedBy"
  | "views"
  | "lastRun"
  | "targetTable"
  | "targetSchema";

export interface ColumnConfig {
  id: ColumnId;
  sortColumn?: UnreferencedItemSortColumn;
}

function createNameColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Name`;
    },
    accessorFn: (item) => getItemName(item),
    cell: ({ row }) => {
      const item = row.original;
      return (
        <EntityCell
          name={getItemName(item)}
          icon={getItemIcon(item)}
          url={getItemUrl(item)}
        />
      );
    },
  };
}

function createCreatorColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Creator`;
    },
    accessorFn: (item) => getCreatorName(item) ?? EMPTY_VALUE,
    cell: ({ getValue }) => <TextCell value={String(getValue())} />,
  };
}

function createOwnerColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Owner`;
    },
    accessorFn: (item) => getOwnerName(item) ?? EMPTY_VALUE,
    cell: ({ getValue }) => <TextCell value={String(getValue())} />,
  };
}

function createCollectionColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Collection`;
    },
    accessorFn: (item) => getCollectionInfo(item)?.name ?? EMPTY_VALUE,
    cell: ({ row }) => {
      const info = getCollectionInfo(row.original);
      if (!info) {
        return <TextCell value={EMPTY_VALUE} />;
      }
      return <LinkCell value={info.name} url={info.url} />;
    },
  };
}

function createDatabaseColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Database`;
    },
    accessorFn: (item) => getDatabaseInfo(item)?.name ?? EMPTY_VALUE,
    cell: ({ row }) => {
      const info = getDatabaseInfo(row.original);
      if (!info) {
        return <TextCell value={EMPTY_VALUE} />;
      }
      return <LinkCell value={info.name} url={info.url} />;
    },
  };
}

function createSchemaColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Schema`;
    },
    accessorFn: (item) => getSchemaInfo(item)?.name ?? EMPTY_VALUE,
    cell: ({ row }) => {
      const info = getSchemaInfo(row.original);
      if (!info) {
        return <TextCell value={EMPTY_VALUE} />;
      }
      return <LinkCell value={info.name} url={info.url} />;
    },
  };
}

function createCreatedAtColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Created at`;
    },
    accessorFn: (item) => formatDate(getCreatedDate(item)),
    cell: ({ getValue }) => <TextCell value={String(getValue())} />,
  };
}

function createLastUpdatedColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Last updated`;
    },
    accessorFn: (item) => formatDate(getLastModifiedDate(item)),
    cell: ({ getValue }) => <TextCell value={String(getValue())} />,
  };
}

function createLastModifiedByColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Last modified by`;
    },
    accessorFn: (item) => getLastModifiedByName(item) ?? EMPTY_VALUE,
    cell: ({ getValue }) => <TextCell value={String(getValue())} />,
  };
}

function createViewsColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Views`;
    },
    accessorFn: (item) => {
      const count = getViewCount(item);
      return count != null ? String(count) : EMPTY_VALUE;
    },
    align: "right",
    cell: ({ getValue }) => (
      <TextCell value={String(getValue())} align="right" />
    ),
  };
}

function createLastRunColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Last run`;
    },
    accessorFn: (item) => formatDate(getLastRunDate(item)),
    cell: ({ getValue }) => <TextCell value={String(getValue())} />,
  };
}

function createTargetTableColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Target table`;
    },
    accessorFn: (item) => getTargetTableInfo(item)?.name ?? EMPTY_VALUE,
    cell: ({ row }) => {
      const info = getTargetTableInfo(row.original);
      if (!info) {
        return <TextCell value={EMPTY_VALUE} />;
      }
      return <LinkCell value={info.name} url={info.url} />;
    },
  };
}

function createTargetSchemaColumn(
  config: ColumnConfig,
): ColumnOptions<UnreferencedItem, string> {
  return {
    id: config.id,
    get name() {
      return t`Target schema`;
    },
    accessorFn: (item) => {
      if (item.type !== "transform") {
        return EMPTY_VALUE;
      }
      return item.data.table?.schema ?? item.data.target?.schema ?? EMPTY_VALUE;
    },
    cell: ({ getValue }) => <TextCell value={String(getValue())} />,
  };
}

const COLUMN_CREATORS: Record<
  ColumnId,
  (config: ColumnConfig) => ColumnOptions<UnreferencedItem, string>
> = {
  name: createNameColumn,
  creator: createCreatorColumn,
  owner: createOwnerColumn,
  collection: createCollectionColumn,
  database: createDatabaseColumn,
  schema: createSchemaColumn,
  createdAt: createCreatedAtColumn,
  lastUpdated: createLastUpdatedColumn,
  lastModifiedBy: createLastModifiedByColumn,
  views: createViewsColumn,
  lastRun: createLastRunColumn,
  targetTable: createTargetTableColumn,
  targetSchema: createTargetSchemaColumn,
};

const TASKS_ITEM_COLUMNS: ColumnConfig[] = [
  { id: "name", sortColumn: "name" },
  { id: "creator" },
  { id: "collection" },
  { id: "lastUpdated" },
  { id: "lastModifiedBy" },
];

const ENTITY_TABLE_CONFIG: Record<EntityTypeFilterValue, ColumnConfig[]> = {
  model: TASKS_ITEM_COLUMNS,
  question: [
    { id: "name", sortColumn: "name" },
    { id: "creator" },
    { id: "collection" },
    { id: "lastUpdated" },
    { id: "lastModifiedBy" },
    { id: "views", sortColumn: "view_count" },
  ],
  metric: TASKS_ITEM_COLUMNS,
  dashboard: [...TASKS_ITEM_COLUMNS, { id: "views" }],
  document: [
    { id: "name", sortColumn: "name" },
    { id: "creator" },
    { id: "collection" },
    { id: "createdAt" },
    { id: "views" },
  ],
  table: [
    { id: "name", sortColumn: "name" },
    { id: "owner" },
    { id: "database" },
    { id: "schema" },
    { id: "views" },
  ],
  transform: [
    { id: "name", sortColumn: "name" },
    { id: "creator" },
    { id: "targetTable" },
    { id: "targetSchema" },
    { id: "lastRun" },
  ],
  snippet: [{ id: "name", sortColumn: "name" }],
  sandbox: [{ id: "name", sortColumn: "name" }],
};

export function getColumnsForEntityType(
  entityType: EntityTypeFilterValue,
): ColumnOptions<UnreferencedItem, string>[] {
  const configs = ENTITY_TABLE_CONFIG[entityType];
  return configs.map((config) => COLUMN_CREATORS[config.id](config));
}

export function getColumnIdToSortColumn(
  entityType: EntityTypeFilterValue,
): Partial<Record<string, UnreferencedItemSortColumn>> {
  const configs = ENTITY_TABLE_CONFIG[entityType];
  const result: Partial<Record<string, UnreferencedItemSortColumn>> = {};

  for (const config of configs) {
    if (config.sortColumn) {
      result[config.id] = config.sortColumn;
    }
  }

  return result;
}
