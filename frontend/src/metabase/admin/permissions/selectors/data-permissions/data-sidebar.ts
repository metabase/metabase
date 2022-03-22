import { createSelector } from "reselect";
import { t } from "ttag";
import _ from "underscore";

import { getMetadataWithHiddenTables } from "metabase/selectors/metadata";

import {
  getTableEntityId,
  getSchemaEntityId,
  getDatabaseEntityId,
} from "../../utils/data-entity-id";
import { State } from "metabase-types/store";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { getIsLoadingDatabaseTables } from "./permission-editor";
import Database from "metabase-lib/lib/metadata/Database";
import { EntityId, RawDataRouteParams } from "../../types";
import { ITreeNodeItem } from "metabase/components/tree/types";
import { getDatabase } from "../../utils/metadata";

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

const getDatabasesSidebar = (metadata: Metadata) => {
  const entities = Object.values(metadata.databases)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(database => ({
      id: database.id,
      name: database.name,
      entityId: getDatabaseEntityId(database),
      icon: "database",
    }));

  return {
    entityGroups: [entities],
    entityViewFocus: "database",
    filterPlaceholder: t`Search for a database`,
  };
};

type DataTreeNodeItem = {
  entityId: EntityId;
  children?: DataTreeNodeItem[];
} & ITreeNodeItem;

const getTablesSidebar = (
  database: Database,
  schemaName?: string,
  tableId?: string,
) => {
  let selectedId = null;

  if (tableId != null) {
    selectedId = getTableId(tableId);
  } else if (schemaName != null) {
    selectedId = getSchemaId(schemaName);
  }

  let entities: DataTreeNodeItem[] = database
    .getSchemas()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(schema => {
      return {
        id: getSchemaId(schema.name),
        name: schema.name,
        entityId: getSchemaEntityId(schema),
        icon: "folder",
        children: schema
          .getTables()
          .sort((a, b) => a.displayName().localeCompare(b.displayName()))
          .map(table => ({
            id: getTableId(table.id),
            entityId: getTableEntityId(table),
            name: table.displayName(),
            icon: "table",
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
    entityGroups: [entities].filter(Boolean),
    filterPlaceholder: t`Search for a table`,
  };
};

export const getDataFocusSidebar = createSelector(
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

    const database = getDatabase(metadata, databaseId);

    return getTablesSidebar(database, schemaName, tableId);
  },
);
