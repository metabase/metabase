/* @flow */

import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";

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
  },

  objectSelectors: {
    getName: dashboard => dashboard && dashboard.name,
    getUrl: dashboard => dashboard && Urls.dashboard(dashboard.id),
    getIcon: dashboard => "dashboard",
  },

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Dashboards;
