/* @flow */

import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";
import { assocIn } from "icepick";

import { POST, DELETE } from "metabase/lib/api";

const FAVORITE_ACTION = `metabase/entities/dashboards/FAVORITE`;
const UNFAVORITE_ACTION = `metabase/entities/dashboards/UNFAVORITE`;

const Dashboards = createEntity({
  name: "dashboards",
  path: "/api/dashboard",

  api: {
    favorite: POST("/api/dashboard/:id/favorite"),
    unfavorite: DELETE("/api/dashboard/:id/favorite"),
  },

  objectActions: {
    setArchived: ({ id }, archived) =>
      Dashboards.actions.update({ id, archived }),
    setCollection: ({ id }, collection) =>
      Dashboards.actions.update({
        id,
        collection_id: collection && collection.id,
      }),
    setPinned: ({ id }, pinned) =>
      Dashboards.actions.update({ id, collection_position: pinned ? 1 : null }),
    setFavorited: async ({ id }, favorited) => {
      if (favorited) {
        await Dashboards.api.favorite({ id });
        return { type: FAVORITE_ACTION, payload: id };
      } else {
        await Dashboards.api.unfavorite({ id });
        return { type: UNFAVORITE_ACTION, payload: id };
      }
    },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === FAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorited"], true);
    } else if (type === UNFAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorited"], false);
    }
    return state;
  },

  objectSelectors: {
    getFavorited: dashboard => dashboard && dashboard.favorited,
    getName: dashboard => dashboard && dashboard.name,
    getUrl: dashboard => dashboard && Urls.dashboard(dashboard.id),
    getIcon: dashboard => "dashboard",
    getColor: () => normal.blue,
  },

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Dashboards;
