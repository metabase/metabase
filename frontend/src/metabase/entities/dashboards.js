/* @flow */

import {
  compose,
  withAction,
  withAnalytics,
  withRequestState,
} from "metabase/lib/redux";

import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";
import { assocIn } from "icepick";
import { t } from "ttag";

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

  displayNameOne: t`dashboard`,
  displayNameMany: t`dashboards`,

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

    // TODO move into more common area as copy is implemented for more entities
    copy: compose(
      withAction(COPY_ACTION),
      // NOTE: unfortunately we can't use Dashboard.withRequestState, etc because the entity isn't defined yet
      withRequestState(dashboard => [
        "entities",
        "dashboard",
        dashboard.id,
        "copy",
      ]),
      withAnalytics("entities", "dashboard", "copy"),
    )(
      (entityObject, overrides, { notify } = {}) => async (
        dispatch,
        getState,
      ) => {
        const result = Dashboards.normalize(
          await Dashboards.api.copy({
            id: entityObject.id,
            ...overrides,
          }),
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
    save: dashboard => async dispatch => {
      const savedDashboard = await Dashboards.api.save(dashboard);
      dispatch({ type: Dashboards.actionTypes.INVALIDATE_LISTS_ACTION });
      return {
        type: "metabase/entities/dashboards/SAVE_DASHBOARD",
        payload: savedDashboard,
      };
    },
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
    getColor: () => color("dashboard"),
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
        validate: collectionId =>
          collectionId === undefined ? "Collection is required" : null,
      },
    ],
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});

export default Dashboards;
