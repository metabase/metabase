/* @flow */

import { createEntity, undo } from "metabase/lib/entities";
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
    setArchived: ({ id }, archived, opts) =>
      Dashboards.actions.update(
        { id },
        { archived },
        undo(opts, "dashboard", archived ? "archived" : "unarchived"),
      ),

    setCollection: ({ id }, collection, opts) =>
      Dashboards.actions.update(
        { id },
        // TODO - would be dope to make this check in one spot instead of on every movable item type
        {
          collection_id:
            !collection || collection.id === "root" ? null : collection.id,
        },
        undo(opts, "dashboard", "moved"),
      ),

    setPinned: ({ id }, pinned, opts) =>
      Dashboards.actions.update(
        { id },
        { collection_position: pinned ? 1 : null },
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
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === FAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorite"], true);
    } else if (type === UNFAVORITE_ACTION && !error) {
      return assocIn(state, [payload, "favorite"], false);
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
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Dashboards;
