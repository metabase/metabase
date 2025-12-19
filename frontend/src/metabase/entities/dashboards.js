import { t } from "ttag";

import {
  dashboardApi,
  useGetDashboardQuery,
  useListDashboardsQuery,
} from "metabase/api/dashboard";
import {
  canonicalCollectionId,
  isRootTrashCollection,
} from "metabase/collections/utils";
import {
  getCollectionType,
  normalizedCollection,
} from "metabase/entities/collections/utils";
import { color } from "metabase/lib/colors";
import {
  createEntity,
  entityCompatibleQuery,
  undo,
} from "metabase/lib/entities";
import { compose, withAction, withRequestState } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

const COPY_ACTION = `metabase/entities/dashboards/COPY`;

/**
 * @deprecated use "metabase/api" instead
 */
export const Dashboards = createEntity({
  name: "dashboards",
  nameOne: "dashboard",
  path: "/api/dashboard",

  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameOne: t`dashboard`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameMany: t`dashboards`,

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery: useGetDashboardQuery,
    }),
    useListQuery: useListDashboardsQuery,
  },

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.listDashboards,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        { ...entityQuery, ignore_error: options?.noEvent },
        dispatch,
        dashboardApi.endpoints.getDashboard,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.createDashboard,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.updateDashboard,
      ),
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(
        id,
        dispatch,
        dashboardApi.endpoints.deleteDashboard,
      ),
    save: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.saveDashboard,
      ),
    copy: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        dashboardApi.endpoints.copyDashboard,
      ),
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Dashboards.actions.update(
        { id },
        { archived },
        undo(opts, t`dashboard`, archived ? t`trashed` : t`restored`),
      ),

    setCollection: ({ id }, collection, opts) =>
      Dashboards.actions.update(
        { id },
        {
          collection_id: canonicalCollectionId(collection && collection.id),
          archived: isRootTrashCollection(collection),
        },
        undo(opts, "dashboard", "moved"),
      ),

    setPinned: ({ id }, pinned, opts) =>
      Dashboards.actions.update(
        { id },
        {
          collection_position:
            typeof pinned === "number" ? pinned : pinned ? 1 : null,
        },
        opts,
      ),

    // TODO move into more common area as copy is implemented for more entities
    copy: compose(
      withAction(COPY_ACTION),
      // NOTE: unfortunately we can't use Dashboard.withRequestState, etc because the entity isn't defined yet
      withRequestState((dashboard) => [
        "entities",
        "dashboard",
        dashboard.id,
        "copy",
      ]),
    )(
      (entityObject, overrides, { notify } = {}) =>
        async (dispatch, getState) => {
          const result = Dashboards.normalize(
            await entityCompatibleQuery(
              {
                id: entityObject.id,
                ...overrides,
                is_deep_copy: !overrides.is_shallow_copy,
              },
              dispatch,
              dashboardApi.endpoints.copyDashboard,
            ),
          );
          if (notify) {
            dispatch(addUndo(notify));
          }
          dispatch({ type: Dashboards.actionTypes.INVALIDATE_LISTS_ACTION });
          return result;
        },
    ),
  },

  actions: {
    save: (dashboard) => async (dispatch) => {
      const savedDashboard = await entityCompatibleQuery(
        dashboard,
        dispatch,
        dashboardApi.endpoints.saveDashboard,
      );
      dispatch({ type: Dashboards.actionTypes.INVALIDATE_LISTS_ACTION });
      return {
        type: "metabase/entities/dashboards/SAVE_DASHBOARD",
        payload: savedDashboard,
      };
    },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === COPY_ACTION && !error && state[""]) {
      return { ...state, "": state[""].concat([payload.result]) };
    }
    return state;
  },

  objectSelectors: {
    getName: (dashboard) => dashboard && dashboard.name,
    getCollection: (dashboard) =>
      dashboard && normalizedCollection(dashboard.collection),
    getColor: () => color("dashboard"),
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});
