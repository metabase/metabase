/* @flow */

import { createThunkAction } from "metabase/lib/redux";
import { setRequestState } from "metabase/redux/requests";
import { normalize } from "normalizr";

import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";
import { assocIn } from "icepick";
import { t } from "c-3po";

import { addUndo } from "metabase/redux/undo";

import { POST, DELETE } from "metabase/lib/api";
import {
  canonicalCollectionId,
  getCollectionType,
} from "metabase/entities/collections";

const FAVORITE_ACTION = `metabase/entities/dashboards/FAVORITE`;
const UNFAVORITE_ACTION = `metabase/entities/dashboards/UNFAVORITE`;
const COPY_ACTION = `metabase/entities/dashboards/COPY`;

const Dashboards = createEntity({
  name: "dashboards",
  path: "/api/dashboard",

  api: {
    favorite: POST("/api/dashboard/:id/favorite"),
    unfavorite: DELETE("/api/dashboard/:id/favorite"),
    save: POST("/api/dashboard/save"),
    copy: POST("/api/dashboard/:id/copy"),
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Dashboards.actions.update(
        { id },
        { archived },
        undo(opts, "dashboard", archived ? "archived" : "unarchived"),
      ),

    setCollection: ({ id }, collection, opts) =>
      Dashboards.actions.update(
        { id },
        { collection_id: canonicalCollectionId(collection && collection.id) },
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

    setFavorited: async ({ id }, favorite) => {
      if (favorite) {
        await Dashboards.api.favorite({ id });
        return { type: FAVORITE_ACTION, payload: id };
      } else {
        await Dashboards.api.unfavorite({ id });
        return { type: UNFAVORITE_ACTION, payload: id };
      }
    },

    copy: ({ id }, overrides, opts) =>
      Dashboards.actions.copy({ id }, overrides, opts),
  },

  actions: {
    save: dashboard => async dispatch => {
      const savedDashboard = await Dashboards.api.save(dashboard);
      dispatch({ type: Dashboards.actionTypes.INVALIDATE_LISTS_ACTION });
      return {
        type: "metabase/entities/dashboards/SAVE_DASHBOARD",
        payload: savedDashboard,
      };
    },

    // TODO move into more common area as copy is implemented for more entities
    copy: createThunkAction(
      COPY_ACTION,
      (entityObject, overrides, { notify } = {}) => async (
        dispatch,
        getState,
      ) => {
        const statePath = [
          "entities",
          entityObject.name,
          entityObject.id,
          "copy",
        ];
        try {
          dispatch(setRequestState({ statePath, state: "LOADING" }));
          const result = normalize(
            await Dashboards.api.copy({ id: entityObject.id, ...overrides }),
            Dashboards.schema,
          );
          dispatch(setRequestState({ statePath, state: "LOADED" }));
          if (notify) {
            dispatch(addUndo(notify));
          }
          dispatch({ type: Dashboards.actionTypes.INVALIDATE_LISTS_ACTION });
          return result;
        } catch (error) {
          console.error(`${COPY_ACTION} failed:`, error);
          dispatch(setRequestState({ statePath, error }));
          throw error;
        }
      },
    ),
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === FAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorite"], true);
    } else if (type === UNFAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorite"], false);
    } else if (type === COPY_ACTION && !error && state[""]) {
      return { ...state, "": state[""].concat([payload.result]) };
    }
    return state;
  },

  objectSelectors: {
    getFavorited: dashboard => dashboard && dashboard.favorite,
    getName: dashboard => dashboard && dashboard.name,
    getUrl: dashboard => dashboard && Urls.dashboard(dashboard.id),
    getIcon: dashboard => "dashboard",
    getColor: () => normal.blue,
  },

  form: {
    fields: [
      {
        name: "name",
        title: t`Name`,
        placeholder: t`What is the name of your dashboard?`,
        validate: name => (!name ? "Name is required" : null),
      },
      {
        name: "description",
        title: t`Description`,
        type: "text",
        placeholder: t`It's optional but oh, so helpful`,
      },
      {
        name: "collection_id",
        title: t`Which collection should this go in?`,
        type: "collection",
        validate: colelctionId =>
          colelctionId === undefined ? "Collection is required" : null,
      },
    ],
  },

  getAnalyticsMetadata(action, object, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});

export default Dashboards;
