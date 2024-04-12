import type { Selector } from "@reduxjs/toolkit";
import { createSelector } from "@reduxjs/toolkit";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import Groups from "metabase/entities/groups";
import Tables from "metabase/entities/tables";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { getMetadataWithHiddenTables } from "metabase/selectors/metadata";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type {
  DatabaseId,
  Group,
  GroupsPermissions,
  TableId,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  DataRouteParams,
  RawGroupRouteParams,
  PermissionSectionConfig,
} from "../../types";
import { DataPermissionValue, DataPermission } from "../../types";
import {
  getTableEntityId,
  getSchemaEntityId,
  getDatabaseEntityId,
  getPermissionSubject,
} from "../../utils/data-entity-id";
import { hasPermissionValueInEntityGraphs } from "../../utils/graph";

import type { EditorBreadcrumb } from "./breadcrumbs";
import {
  getDatabasesEditorBreadcrumbs,
  getGroupsDataEditorBreadcrumbs,
} from "./breadcrumbs";
import { buildFieldsPermissions } from "./fields";
import { getOrderedGroups } from "./groups";
import { buildSchemasPermissions } from "./schemas";
import { buildTablesPermissions } from "./tables";

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

type RouteParamsSelectorParameters = {
  params: DataRouteParams;
};

const getRouteParams = (
  _state: State,
  props: RouteParamsSelectorParameters,
) => {
  const { databaseId, schemaName, tableId } = props.params;
  return {
    databaseId,
    schemaName,
    tableId,
  };
};

export const getDataPermissions = (state: State) =>
  state.admin.permissions.dataPermissions;

const getOriginalDataPermissions = (state: State) =>
  state.admin.permissions.originalDataPermissions;

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

const hasViewDataOptions = (entities: any[]) => {
  return entities.some(
    entity =>
      entity.permissions?.findIndex(
        (permissionSectionConfig: any) =>
          permissionSectionConfig.permission === DataPermission.VIEW_DATA,
      ) > -1,
  );
};

export const getDatabasesPermissionEditor = createSelector(
  getMetadataWithHiddenTables,
  getGroupRouteParams,
  getDataPermissions,
  getOriginalDataPermissions,
  getGroup,
  Groups.selectors.getList,
  getIsLoadingDatabaseTables,
  (
    metadata,
    params,
    permissions: GroupsPermissions,
    originalPermissions: GroupsPermissions,
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

    let entities: any = [];

    const database = metadata?.database(databaseId);

    if (database && (schemaName != null || hasSingleSchema)) {
      const schema: Schema = hasSingleSchema
        ? database.getSchemas()[0]
        : (database.schema(schemaName) as Schema);

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
              originalPermissions,
              defaultGroup,
              database,
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
              originalPermissions,
              defaultGroup,
            ),
          };
        });
    } else if (groupId != null) {
      entities = metadata
        .databasesList({ savedQuestions: false })
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
              originalPermissions,
              defaultGroup,
              database,
            ),
          };
        });
    }

    const permissionSubject = getPermissionSubject(
      { databaseId, schemaName },
      hasSingleSchema,
    );

    const columns = _.compact([
      { name: getEditorEntityName(params, hasSingleSchema) },
      hasViewDataOptions(entities) && { name: t`View data` },
      { name: t`Create queries` },
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns(permissionSubject),
    ]);

    const breadcrumbs = getDatabasesEditorBreadcrumbs(params, metadata, group);
    const title = t`Permissions for the `;

    const deprecatedPermsInGraph = new Set(
      _.compact([
        hasPermissionValueInEntityGraphs(
          permissions,
          entities.map((entity: any) => ({ groupId, ...entity.entityId })),
          DataPermission.VIEW_DATA,
          DataPermissionValue.LEGACY_NO_SELF_SERVICE,
        ) && DataPermissionValue.LEGACY_NO_SELF_SERVICE,
      ]),
    );

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
      deprecatedPermsInGraph,
    };
  },
);

type DataPermissionEditorEntity = {
  id: Group["id"];
  name: Group["name"];
  hint: string | null;
  entityId: {
    databaseId?: DatabaseId;
    schemaName?: Schema["name"];
    tableId?: TableId;
  };
  permissions?: PermissionSectionConfig[];
};

type DataPermissionEditorProps = {
  title: string;
  filterPlaceholder: string;
  breadcrumbs: EditorBreadcrumb[] | null;
  columns: { name: string }[];
  entities: DataPermissionEditorEntity[];
};

type GetGroupsDataPermissionEditorSelectorParameters =
  RouteParamsSelectorParameters & {
    includeHiddenTables?: boolean;
  };

type GetGroupsDataPermissionEditorSelector = Selector<
  State,
  DataPermissionEditorProps | null,
  GetGroupsDataPermissionEditorSelectorParameters[]
>;

export const getGroupsDataPermissionEditor: GetGroupsDataPermissionEditorSelector =
  createSelector(
    getMetadataWithHiddenTables,
    getRouteParams,
    getDataPermissions,
    getOriginalDataPermissions,
    getOrderedGroups,
    (metadata, params, permissions, originalPermissions, groups) => {
      const { databaseId, schemaName, tableId } = params;
      const database = metadata?.database(databaseId);

      if (!permissions || databaseId == null || !database) {
        return null;
      }

      const sortedGroups = groups.flat();

      const defaultGroup = _.find(sortedGroups, isDefaultGroup);

      if (!defaultGroup) {
        throw new Error("No default group found");
      }

      const entities = sortedGroups.map(group => {
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
            originalPermissions,
            defaultGroup,
            database,
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
            originalPermissions,
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
            originalPermissions,
            defaultGroup,
            database,
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

      const permissionSubject = getPermissionSubject(params);

      const columns = _.compact([
        { name: t`Group name` },
        hasViewDataOptions(entities) && { name: t`View data` },
        { name: t`Create queries` },
        ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDataColumns(permissionSubject),
      ]);

      const deprecatedPermsInGraph = new Set(
        _.compact([
          hasPermissionValueInEntityGraphs(
            permissions,
            entities.map((entity: any) => ({
              groupId: entity.id,
              ...entity.entityId,
            })),
            DataPermission.VIEW_DATA,
            DataPermissionValue.LEGACY_NO_SELF_SERVICE,
          ) && DataPermissionValue.LEGACY_NO_SELF_SERVICE,
        ]),
      );

      return {
        title: t`Permissions for`,
        filterPlaceholder: t`Search for a group`,
        breadcrumbs: getGroupsDataEditorBreadcrumbs(params, metadata),
        columns,
        entities,
        deprecatedPermsInGraph,
      };
    },
  );
