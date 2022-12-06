import { DataAppsApi } from "metabase/services";

import DataApps, {
  getChildNavItems,
  EditableDataAppParams,
} from "metabase/entities/data-apps";
import Dashboards from "metabase/entities/dashboards";

import type { DataApp, DataAppPage } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export type ScaffoldNewAppParams = {
  name: EditableDataAppParams["name"];
  tables: number[]; // list of table IDs
};

export const scaffoldDataApp = ({ name, tables }: ScaffoldNewAppParams) => {
  return async (dispatch: Dispatch) => {
    const dataApp = await DataAppsApi.scaffoldNewApp({
      "app-name": name,
      "table-ids": tables,
    });
    dispatch({
      type: DataApps.actionTypes.CREATE,
      payload: DataApps.normalize(dataApp),
    });
    return dataApp;
  };
};

export type ScaffoldNewPagesParams = {
  dataAppId: DataApp["id"];
  tables: number[]; // list of table IDs
};

export const scaffoldDataAppPages = ({
  dataAppId,
  tables,
}: ScaffoldNewPagesParams) => {
  return async (dispatch: Dispatch) => {
    const dataApp = await DataAppsApi.scaffoldNewPages({
      id: dataAppId,
      "table-ids": tables,
    });
    dispatch({
      type: DataApps.actionTypes.UPDATE,
      payload: DataApps.normalize(dataApp),
    });
    return dataApp;
  };
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
