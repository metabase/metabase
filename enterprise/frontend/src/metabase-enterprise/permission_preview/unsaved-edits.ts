import { useEffect, useMemo, useState } from "react";
import _ from "underscore";

import { skipToken, useListDatabasesQuery } from "metabase/api";
import {
  getModifiedGroupsPermissionsGraphParts,
  selectGroupList,
} from "metabase/permissions";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import {
  DataPermission,
  DataPermissionValue,
  type DatabaseId,
  type DatabasePermissions,
  type GroupsPermissions,
  type Table,
  type TableId,
} from "metabase-types/api";

import { type UnsavedEdit, useCreateUnsavedEditsMutation } from "./api";
import {
  type PreviewColumn,
  getGraphValueLabel,
  getPreviewColumnName,
} from "./troubleshoot/preview-options";

export type UnsavedEditsState = {
  edits: UnsavedEdit[];
  /** Kept on the server for the preview to read; undefined until it's kept, and when there are no edits. */
  unsavedEditsId: string | undefined;
};

/**
 * The admin's unsaved data permission edits on the permissions page, listed for "See changes" and kept on the server
 * (never saved), so a preview can read them by id. A new edit keeps a new copy.
 */
export function useUnsavedEdits(): UnsavedEditsState {
  const dataPermissions = useSelector(
    (state: State) => state.admin.permissions.dataPermissions,
  );
  const originalDataPermissions = useSelector(
    (state: State) => state.admin.permissions.originalDataPermissions,
  );
  const databasesWithTables = useSelector(
    (state: State) => state.admin.permissions.databasesWithTables,
  );
  const groups = useSelector(selectGroupList);
  const [createUnsavedEdits] = useCreateUnsavedEditsMutation();
  const [kept, setKept] = useState<{ key: string; id: string } | null>(null);

  const modifiedGroups = useMemo(
    () =>
      // both are null until the permissions page loads its graph, though the store type says otherwise
      dataPermissions != null && originalDataPermissions != null
        ? getModifiedGroupsPermissionsGraphParts(
            dataPermissions,
            originalDataPermissions,
            Object.keys(dataPermissions),
            [],
          )
        : {},
    [dataPermissions, originalDataPermissions],
  );
  const { data: databaseList } = useListDatabasesQuery(
    _.isEmpty(modifiedGroups) ? skipToken : undefined,
  );

  const edits = useMemo(
    () =>
      getUnsavedEdits({
        modifiedGroups,
        originalGroups: originalDataPermissions,
        groupNames: new Map(groups.map((group) => [group.id, group.name])),
        databases: (databaseList?.data ?? []).map((database) => ({
          id: database.id,
          name: database.name,
          tables: databasesWithTables[database.id]?.tables ?? [],
        })),
      }),
    [
      modifiedGroups,
      originalDataPermissions,
      groups,
      databaseList,
      databasesWithTables,
    ],
  );

  const key = JSON.stringify(modifiedGroups);
  useEffect(() => {
    // wait for the database names, since the kept copy keeps the labels too
    if (edits.length === 0 || kept?.key === key || databaseList == null) {
      return;
    }
    let isCurrent = true;
    createUnsavedEdits({ groups: modifiedGroups, edits }).then((result) => {
      if (isCurrent && result.data != null) {
        setKept({ key, id: result.data.unsaved_edits_id });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [key, kept, edits, modifiedGroups, databaseList, createUnsavedEdits]);

  return {
    edits,
    unsavedEditsId: edits.length > 0 && kept?.key === key ? kept.id : undefined,
  };
}

const COLUMN_BY_PERMISSION: Partial<Record<DataPermission, PreviewColumn>> = {
  [DataPermission.VIEW_DATA]: "view_data",
  [DataPermission.CREATE_QUERIES]: "create_queries",
  [DataPermission.DOWNLOAD]: "download_results",
  [DataPermission.DATA_MODEL]: "manage_table_metadata",
  [DataPermission.DETAILS]: "manage_database",
  [DataPermission.TRANSFORMS]: "transforms",
};

type GraphNode = string | { [key: string]: GraphNode } | undefined;

type GetUnsavedEditsOptions = {
  /** Only the databases an edit touched, as `getModifiedGroupsPermissionsGraphParts` returns them. */
  modifiedGroups: GroupsPermissions;
  originalGroups: GroupsPermissions;
  groupNames: Map<number, string>;
  databases: { id: DatabaseId; name: string; tables: Table[] }[];
};

/**
 * One row per changed value: a whole database's value when neither side is granular, else one row per table whose
 * value changed.
 */
export function getUnsavedEdits({
  modifiedGroups,
  originalGroups,
  groupNames,
  databases,
}: GetUnsavedEditsOptions): UnsavedEdit[] {
  return Object.entries(modifiedGroups).flatMap(
    ([groupIdString, groupPermissions]) => {
      const groupId = Number(groupIdString);
      return Object.entries(groupPermissions).flatMap(
        ([databaseIdString, databasePermissions]) => {
          const databaseId = Number(databaseIdString);
          const database = databases.find(({ id }) => id === databaseId);
          return getDatabaseEdits({
            groupId,
            groupName: groupNames.get(groupId) ?? String(groupId),
            databaseId,
            databaseName: database?.name ?? String(databaseId),
            tables: database?.tables ?? [],
            before: originalGroups[groupId]?.[databaseId],
            after: databasePermissions,
          });
        },
      );
    },
  );
}

type GetDatabaseEditsOptions = {
  groupId: number;
  groupName: string;
  databaseId: DatabaseId;
  databaseName: string;
  tables: Table[];
  before: DatabasePermissions | undefined;
  after: DatabasePermissions | undefined;
};

function getDatabaseEdits(options: GetDatabaseEditsOptions): UnsavedEdit[] {
  const { groupId, groupName, databaseId, databaseName, tables } = options;
  return Object.values(DataPermission).flatMap((permission) => {
    const column = COLUMN_BY_PERMISSION[permission];
    const before = getPermissionNode(options.before, permission);
    const after = getPermissionNode(options.after, permission);
    if (column == null || _.isEqual(before, after)) {
      return [];
    }
    function getEdit(
      label: string,
      path: string[],
      tableId?: TableId,
    ): UnsavedEdit[] {
      if (column == null) {
        return [];
      }
      const beforeLabel = getValueLabel(column, getNodeValue(before, path));
      const afterLabel = getValueLabel(column, getNodeValue(after, path));
      // a value the edit only writes out ("no" where nothing was set) changes nothing
      if (beforeLabel === afterLabel) {
        return [];
      }
      return [
        {
          group_id: groupId,
          group_name: groupName,
          database_id: databaseId,
          ...(tableId != null && { table_id: tableId }),
          label,
          permission: getPreviewColumnName(column),
          before: beforeLabel,
          after: afterLabel,
        },
      ];
    }
    const isGranular = typeof before === "object" || typeof after === "object";
    if (!isGranular || tables.length === 0) {
      return getEdit(databaseName, []);
    }
    return tables.flatMap((table) =>
      getEdit(
        `${databaseName} · ${table.display_name ?? table.name}`,
        [table.schema ?? "", String(table.id)],
        table.id,
      ),
    );
  });
}

/** A permission's value or its per-schema tree; download and table metadata keep theirs under `schemas`. */
function getPermissionNode(
  permissions: DatabasePermissions | undefined,
  permission: DataPermission,
): GraphNode {
  switch (permission) {
    case DataPermission.VIEW_DATA:
      return permissions?.[DataPermission.VIEW_DATA];
    case DataPermission.CREATE_QUERIES:
      return permissions?.[DataPermission.CREATE_QUERIES];
    case DataPermission.DOWNLOAD:
      return permissions?.[DataPermission.DOWNLOAD]?.schemas;
    case DataPermission.DATA_MODEL:
      return permissions?.[DataPermission.DATA_MODEL]?.schemas;
    case DataPermission.DETAILS:
      return permissions?.[DataPermission.DETAILS];
    case DataPermission.TRANSFORMS:
      return permissions?.[DataPermission.TRANSFORMS];
    default:
      return undefined;
  }
}

/** The value at a schema and table, or "controlled" when it's set further down. */
function getNodeValue(node: GraphNode, path: string[]): string | undefined {
  if (node == null || typeof node === "string") {
    return node;
  }
  const [key, ...rest] = path;
  if (key == null) {
    return DataPermissionValue.CONTROLLED;
  }
  return getNodeValue(node[key], rest);
}

/** A value nothing sets grants nothing, so it reads as "No". */
function getValueLabel(column: PreviewColumn, value: string | undefined) {
  return getGraphValueLabel(column, value ?? DataPermissionValue.NO);
}

/** The data permission an edit row names, for outlining its cell in the grid. */
export function getEditDataPermission(edit: UnsavedEdit) {
  return Object.values(DataPermission).find((permission) => {
    const column = COLUMN_BY_PERMISSION[permission];
    return column != null && getPreviewColumnName(column) === edit.permission;
  });
}
