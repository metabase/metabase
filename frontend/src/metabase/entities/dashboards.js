import { t } from "ttag";

import { DASHBOARD_TAG } from "metabase/api/tags";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  getCollectionType,
  normalizedCollection,
} from "metabase/entities/collections";
import { POST } from "metabase/lib/api";
import { color } from "metabase/lib/colors";
import { createEntity, undo } from "metabase/lib/entities";
import {
  compose,
  withAction,
  withAnalytics,
  withRequestState,
} from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls/dashboards";
import { addUndo } from "metabase/redux/undo";

import forms from "./dashboards/forms";

const COPY_ACTION = `metabase/entities/dashboards/COPY`;

const Dashboards = createEntity({
  name: "dashboards",
  nameOne: "dashboard",
  rtkEntityTagName: DASHBOARD_TAG,
  path: "/api/dashboard",

  displayNameOne: t`dashboard`,
  displayNameMany: t`dashboards`,

  api: {
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
    )((entityObject, overrides, { notify } = {}) => async dispatch => {
      const result = Dashboards.normalize(
        await Dashboards.api.copy({
          id: entityObject.id,
          ...overrides,
          is_deep_copy: !overrides.is_shallow_copy,
        }),
      );
      if (notify) {
        dispatch(addUndo(notify));
      }
      dispatch(Dashboards.actions.invalidateLists());
      return result;
    }),
  },

  actions: {
    save: dashboard => async dispatch => {
      const savedDashboard = await Dashboards.api.save(dashboard);
      dispatch(Dashboards.actions.invalidateLists());
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
    getName: dashboard => dashboard && dashboard.name,
    getUrl: dashboard => dashboard && Urls.dashboard(dashboard),
    getCollection: dashboard =>
      dashboard && normalizedCollection(dashboard.collection),
    getIcon: () => ({ name: "dashboard" }),
    getColor: () => color("dashboard"),
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },

  forms,
});

export default Dashboards;
