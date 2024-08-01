import type { Selector } from "@reduxjs/toolkit";
import { createSelector } from "@reduxjs/toolkit";
import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/components/tree/types";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_AUDIT } from "metabase/plugins";
import { getMetadataWithHiddenTables } from "metabase/selectors/metadata";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Database as DatabaseType } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { EntityId, RawDataRouteParams } from "../../types";
import {
  getTableEntityId,
  getSchemaEntityId,
  getDatabaseEntityId,
} from "../../utils/data-entity-id";
import { getDatabase } from "../../utils/metadata";

import { getIsLoadingDatabaseTables } from "./permission-editor";

type DataTreeNodeItem = {
  entityId: EntityId;
  children?: DataTreeNodeItem[];
} & ITreeNodeItem;

type DataSidebarProps = {
  title?: string;
  description?: string;
  entityGroups: DataTreeNodeItem[][];
  entityViewFocus?: "database";
  selectedId?: string | null;
  filterPlaceholder?: string;
};

const getRouteParams = (
  _state: State,
  props: { params: RawDataRouteParams },
) => {
  const { databaseId, schemaName, tableId } = props.params;
  return {
    databaseId,
    schemaName,
    tableId,
  };
};

const getSchemaId = (name: string) => `schema:${name}`;
const getTableId = (id: string | number) => `table:${id}`;

const getDatabasesSidebar = (metadata: Metadata): DataSidebarProps => {
  const entities = metadata
    .databasesList({ savedQuestions: false })
    .filter(db => !PLUGIN_AUDIT.isAuditDb(db as DatabaseType))
    .map(database => ({
      id: database.id,
      name: database.name,
      entityId: getDatabaseEntityId(database),
      icon: "database" as const,
    }));

  return {
    entityGroups: [entities],
    entityViewFocus: "database",
    filterPlaceholder: t`Search for a database`,
  };
};

const getTablesSidebar = (
  database: Database,
  schemaName?: string,
  tableId?: string,
): DataSidebarProps => {
  let selectedId = null;

  if (tableId != null) {
    selectedId = getTableId(tableId);
  } else if (schemaName != null) {
    selectedId = getSchemaId(schemaName);
  }

  let entities = database
    .getSchemas()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<DataTreeNodeItem>(schema => {
      return {
        id: getSchemaId(schema.name),
        name: schema.name,
        entityId: getSchemaEntityId(schema),
        icon: "folder" as const,
        children: schema
          .getTables()
          .sort((a, b) => a.displayName().localeCompare(b.displayName()))
          .map(table => ({
            id: getTableId(table.id),
            entityId: getTableEntityId(table),
            name: table.displayName(),
            icon: "table" as const,
          })),
      };
    });

  const shouldIncludeSchemas = database.schemasCount() > 1;
  if (!shouldIncludeSchemas && entities[0]?.children != null) {
    entities = entities[0]?.children;
  }

  return {
    selectedId,
    title: database.name,
    description: t`Select a table to set more specific permissions`,
    entityGroups: [entities].filter(isNotNull),
    filterPlaceholder: t`Search for a table`,
  };
};

export const getDataFocusSidebar: Selector<State, DataSidebarProps | null> =
  createSelector(
    getMetadataWithHiddenTables,
    getRouteParams,
    getIsLoadingDatabaseTables,
    (metadata, params, isLoading) => {
      if (isLoading) {
        return null;
      }

      const { databaseId, schemaName, tableId } = params;

      if (databaseId == null) {
        return getDatabasesSidebar(metadata);
      }

      const database = getDatabase(metadata, parseInt(databaseId));

      return getTablesSidebar(database, schemaName, tableId);
    },
  );
