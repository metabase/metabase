/* @flow */

import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

const Dashboards = createEntity({
  name: "dashboards",
  path: "/api/dashboard",

  objectActions: {
    setArchived: ({ id }, archived) =>
      Dashboards.actions.update({ id, archived }),
    setCollection: ({ id }, collection) =>
      Dashboards.actions.update({
        id,
        collection_id: collection && collection.id,
      }),
    pin: ({ id }) => Dashboards.actions.update({ id, collection_position: 1 }),
    unpin: ({ id }) =>
      Dashboards.actions.update({ id, collection_position: null }),
  },

  objectSelectors: {
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
