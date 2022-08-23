import { color } from "metabase/lib/colors";
import { createEntity } from "metabase/lib/entities";

import { DataAppSchema } from "metabase/schema";
import { CollectionsApi, DataAppsApi } from "metabase/services";

import { DEFAULT_COLLECTION_COLOR_ALIAS } from "../collections/constants";

import { createForm } from "./forms";
import { getDataAppIcon } from "./utils";

const DataApps = createEntity({
  name: "dataApps",
  nameOne: "dataApp",

  displayNameOne: "app",
  displayNameMany: "apps",

  path: "/api/app",
  schema: DataAppSchema,

  api: {
    create: async ({ name, description, ...dataAppProps }) => {
      const collection = await CollectionsApi.create({
        name,
        description: description || null,
        parent_id: null, // apps should always live in root collection
        color: color(DEFAULT_COLLECTION_COLOR_ALIAS),
      });
      return DataAppsApi.create({
        ...dataAppProps,
        collection_id: collection.id,
      });
    },
  },

  objectSelectors: {
    getIcon: getDataAppIcon,
  },

  forms: {
    details: {
      fields: createForm,
    },
  },
});

export { getDataAppIcon };

export default DataApps;
