import { createSelector } from "reselect";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { getMetadataWithHiddenTables } from "metabase/selectors/metadata";

import Groups from "metabase/entities/groups";
import Tables from "metabase/entities/tables";

import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import {
  getTableEntityId,
  getSchemaEntityId,
  getDatabaseEntityId,
} from "../../utils/data-entity-id";

import { buildFieldsPermissions } from "./fields";
import { buildTablesPermissions } from "./tables";
import { buildSchemasPermissions } from "./schemas";
import {
  getDatabasesEditorBreadcrumbs,
  getGroupsDataEditorBreadcrumbs,
} from "./breadcrumbs";
import { Group, GroupsPermissions } from "metabase-types/api";
import Schema from "metabase-lib/lib/metadata/Schema";
import { DataRouteParams, RawGroupRouteParams } from "../../types";
import { State } from "metabase-types/store";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

export const getIsLoadingDatabaseTables = (
  state: State,
  { params }: { params: Pick<RawGroupRouteParams, "databaseId"> },
) =>
  Tables.selectors.getLoading(state, {
    entityQuery: {
      dbId: params.databaseId,
      include_hidden: true,
    },
  });

export const getLoadingDatabaseTablesError = (
  state: State,
  { params }: { params: Pick<RawGroupRouteParams, "databaseId"> },
) => {
  return Tables.selectors.getError(state, {
    entityQuery: {
      dbId: params.databaseId,
      include_hidden: true,
    },
  });
};

const getRouteParams = (_state: State, props: { params: DataRouteParams }) => {
  const { databaseId, schemaName, tableId } = props.params;
  return {
    databaseId,
    schemaName,
    tableId,
  };
};

const getDataPermissions = (state: State) =>
  state.admin.permissions.dataPermissions;

const getGroupRouteParams = (
  _state: State,
  props: { params: RawGroupRouteParams },
) => {
  const { groupId, databaseId, schemaName } = props.params;
  return {
    groupId: groupId != null ? parseInt(groupId) : undefined,
    databaseId: databaseId != null ? parseInt(databaseId) : undefined,
    schemaName,
  };
};

const getEditorEntityName = (
  { databaseId, schemaName }: DataRouteParams,
  hasSingleSchema: boolean,
) => {
  if (schemaName != null || hasSingleSchema) {
    return t`Table name`;
  } else if (databaseId) {
    return t`Schema name`;
  } else {
    return t`Database name`;
  }
};

const getFilterPlaceholder = (
  { databaseId, schemaName }: DataRouteParams,
  hasSingleSchema: boolean,
) => {
  if (schemaName != null || hasSingleSchema) {
    return t`Search for a table`;
  } else if (databaseId) {
    return t`Search for a schema`;
  } else {
    return t`Search for a database`;
  }
};

const getGroup = (state: State, props: { params: RawGroupRouteParams }) => {
  const groupId = props.params.groupId;

  if (!groupId) {
    return null;
  }

  return Groups.selectors.getObject(state, {
    entityId: parseInt(groupId),
  });
};

export const getDatabasesPermissionEditor = createSelector(
  getMetadataWithHiddenTables,
  getGroupRouteParams,
  getDataPermissions,
  getGroup,
  Groups.selectors.getList,
  getIsLoadingDatabaseTables,
  (
    metadata,
    params,
    permissions: GroupsPermissions,
    group: Group,
    groups: Group[],
    isLoading,
  ) => {
    const { groupId, databaseId, schemaName } = params;

    if (isLoading || !permissions || groupId == null || !group) {
      return null;
    }

    const isAdmin = isAdminGroup(group);
    const defaultGroup = _.find(groups, isDefaultGroup);

    if (!defaultGroup) {
      throw new Error("No default group found");
    }

    const hasSingleSchema =
      databaseId != null &&
      metadata.database(databaseId)?.getSchemas().length === 1;

    const columns = [
      { name: getEditorEntityName(params, hasSingleSchema) },
      { name: t`Data access` },
      { name: t`Native query editing` },
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataColumns,
    ];

    let entities: any = [];

    if (schemaName != null || hasSingleSchema) {
      const schema: Schema = hasSingleSchema
        ? metadata?.database(databaseId)?.getSchemas()[0]
        : metadata?.database(databaseId)?.schema(schemaName);

      entities = schema
        .getTables()
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .map(table => {
          const entityId = getTableEntityId(table);
          return {
            id: table.id,
            name: table.display_name,
            entityId,
            permissions: buildFieldsPermissions(
              entityId,
              groupId,
              isAdmin,
              permissions,
              defaultGroup,
              metadata.database(databaseId),
            ),
          };
        });
    } else if (databaseId != null) {
      entities = metadata
        ?.database(databaseId)
        ?.getSchemas()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(schema => {
          const entityId = getSchemaEntityId(schema);
          return {
            id: schema.id,
            name: schema.name,
            entityId,
            canSelect: true,
            permissions: buildTablesPermissions(
              entityId,
              groupId,
              isAdmin,
              permissions,
              defaultGroup,
            ),
          };
        });
    } else if (groupId != null) {
      entities = metadata
        .databasesList({ savedQuestions: false })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(database => {
          const entityId = getDatabaseEntityId(database);
          return {
            id: database.id,
            name: database.name,
            entityId,
            canSelect: true,
            permissions: buildSchemasPermissions(
              entityId,
              groupId,
              isAdmin,
              permissions,
              defaultGroup,
            ),
          };
        });
    }

    const breadcrumbs = getDatabasesEditorBreadcrumbs(params, metadata, group);
    const title = t`Permissions for the `;

    return {
      title,
      breadcrumbs,
      description:
        group != null
          ? ngettext(
              msgid`${group.member_count} person`,
              `${group.member_count} people`,
              group.member_count,
            )
          : null,
      filterPlaceholder: getFilterPlaceholder(params, hasSingleSchema),
      columns,
      entities,
    };
  },
);

export const getGroupsDataPermissionEditor = createSelector(
  getMetadataWithHiddenTables,
  getRouteParams,
  getDataPermissions,
  Groups.selectors.getList,
  (metadata, params, permissions, groups: Group[]) => {
    const { databaseId, schemaName, tableId } = params;

    if (!permissions || databaseId == null) {
      return null;
    }

    const defaultGroup = _.find(groups, isDefaultGroup);

    if (!defaultGroup) {
      throw new Error("No default group found");
    }

    const columns = [
      { name: t`Group name` },
      { name: t`Data access` },
      { name: t`Native query editing` },
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataColumns,
    ];

    const entities = groups.map(group => {
      const isAdmin = isAdminGroup(group);
      let groupPermissions;

      if (tableId != null) {
        groupPermissions = buildFieldsPermissions(
          {
            databaseId,
            schemaName,
            tableId,
          },
          group.id,
          isAdmin,
          permissions,
          defaultGroup,
          metadata.database(databaseId),
        );
      } else if (schemaName != null) {
        groupPermissions = buildTablesPermissions(
          {
            databaseId,
            schemaName,
          },
          group.id,
          isAdmin,
          permissions,
          defaultGroup,
        );
      } else if (databaseId != null) {
        groupPermissions = buildSchemasPermissions(
          {
            databaseId,
          },
          group.id,
          isAdmin,
          permissions,
          defaultGroup,
        );
      }

      return {
        id: group.id,
        name: group.name,
        hint: isAdmin
          ? t`The Administrators group is special, and always has Unrestricted access.`
          : null,
        entityId: params,
        permissions: groupPermissions,
      };
    });

    return {
      title: t`Permissions for`,
      filterPlaceholder: t`Search for a group`,
      breadcrumbs: getGroupsDataEditorBreadcrumbs(params, metadata),
      columns,
      entities,
    };
  },
);
