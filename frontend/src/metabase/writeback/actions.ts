import { ActionsApi } from "metabase/services";

import DataApps, { getChildNavItems } from "metabase/entities/data-apps";
import Dashboards from "metabase/entities/dashboards";

import type { DataApp, DataAppPage } from "metabase-types/api";
import type { Value } from "metabase-types/types/Dataset";
import type { Dispatch, GetState } from "metabase-types/store";
import type Table from "metabase-lib/metadata/Table";

export type InsertRowPayload = {
  table: Table;
  values: Record<string, unknown>;
};

export const createRow = (payload: InsertRowPayload) => {
  const { table, values } = payload;
  return ActionsApi.create({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
    },
    create_row: values,
  });
};

export type UpdateRowPayload = {
  table: Table;
  id: Value;
  values: Record<string, unknown>;
};

export const updateRow = (payload: UpdateRowPayload) => {
  const { table, id, values } = payload;
  const field = table.fields.find(field => field.isPK());
  if (!field) {
    throw new Error("Cannot update row from table without a primary key");
  }

  const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
  return ActionsApi.update({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
    update_row: values,
  });
};

export type BulkUpdatePayload = {
  table: Table;
  records: Record<string, unknown>[];
};

export const updateManyRows = (payload: BulkUpdatePayload) => {
  const { table, records } = payload;
  return ActionsApi.bulkUpdate(
    {
      tableId: table.id,
      body: records,
    },
    { bodyParamName: "body" },
  );
};

export type DeleteRowPayload = {
  table: Table;
  id: Value;
};

export const deleteRow = (payload: DeleteRowPayload) => {
  const { table, id } = payload;
  const field = table.fields.find(field => field.isPK());
  if (!field) {
    throw new Error("Cannot delete row from table without a primary key");
  }

  const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
  return ActionsApi.delete({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
  });
};

export type BulkDeletePayload = {
  table: Table;
  ids: Record<string, number | string>[];
};

export const deleteManyRows = (payload: BulkDeletePayload) => {
  const { table, ids } = payload;
  return ActionsApi.bulkDelete(
    {
      tableId: table.id,
      body: ids,
    },
    { bodyParamName: "body" },
  );
};

export type ArchiveDataAppPayload = {
  id: DataApp["id"];
};

export const archiveDataApp = ({ id }: ArchiveDataAppPayload) => {
  return async (dispatch: Dispatch, getState: GetState) => {
    const state = getState();

    const dataApp: DataApp = DataApps.selectors.getObject(state, {
      entityId: id,
    });

    await dispatch(
      DataApps.actions.update({
        id,
        collection_id: dataApp.collection_id,
        collection: {
          archived: true,
        },
      }),
    );
  };
};

export type ArchiveDataAppPagePayload = {
  appId: DataApp["id"];
  pageId: DataAppPage["id"];
};

export const archiveDataAppPage = ({
  appId,
  pageId,
}: ArchiveDataAppPagePayload) => {
  return async (dispatch: Dispatch, getState: GetState) => {
    const state = getState();

    const dataApp: DataApp = DataApps.selectors.getObject(state, {
      entityId: appId,
    });

    const childNavItems = getChildNavItems(dataApp.nav_items, pageId);
    const childPageIds = childNavItems.map(navItem => navItem.page_id);
    const archivedPageIds = [pageId, ...childPageIds];
    const nextNavItems = dataApp.nav_items.filter(
      navItem => !archivedPageIds.includes(navItem.page_id),
    );

    await Promise.all(
      archivedPageIds.map(pageId =>
        dispatch(Dashboards.actions.update({ id: pageId, archived: true })),
      ),
    );

    const isHomepageArchived =
      dataApp.dashboard_id && archivedPageIds.includes(dataApp.dashboard_id);

    await dispatch(
      DataApps.actions.update({
        id: appId,
        nav_items: nextNavItems,
        dashboard_id: isHomepageArchived ? null : dataApp.dashboard_id,
      }),
    );
  };
};
