import { color } from "metabase/lib/colors";
import { createEntity } from "metabase/lib/entities";

import { DataAppSchema } from "metabase/schema";
import { CollectionsApi, DataAppsApi } from "metabase/services";

import { Collection, DataApp } from "metabase-types/api";

import { DEFAULT_COLLECTION_COLOR_ALIAS } from "../collections/constants";

import { createForm } from "./forms";
import { getDataAppIcon, isDataAppCollection } from "./utils";

type EditableDataAppParams = Pick<
  DataApp,
  "dashboard_id" | "options" | "nav_items"
> &
  Pick<Collection, "name" | "description">;

type CreateDataAppParams = Partial<EditableDataAppParams> &
  Pick<EditableDataAppParams, "name">;

const DataApps = createEntity({
  name: "dataApps",
  nameOne: "dataApp",

  displayNameOne: "app",
  displayNameMany: "apps",

  path: "/api/app",
  schema: DataAppSchema,

  api: {
    create: async ({
      name,
      description,
      ...dataAppProps
    }: CreateDataAppParams) => {
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

export { getDataAppIcon, isDataAppCollection };

export default DataApps;
