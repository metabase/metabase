import { color } from "metabase/lib/colors";
import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";

import { DataAppSchema } from "metabase/schema";
import { CollectionsApi, DataAppsApi } from "metabase/services";

import { Collection, DataApp, DataAppSearchItem } from "metabase-types/api";

import { DEFAULT_COLLECTION_COLOR_ALIAS } from "../collections/constants";

import { createNewAppForm, createAppSettingsForm } from "./forms";
import reducer from "./reducer";
import { getDataAppIcon } from "./utils";

type EditableDataAppParams = Pick<
  DataApp,
  "dashboard_id" | "options" | "nav_items"
> &
  Pick<Collection, "name" | "description">;

type CreateDataAppParams = Partial<EditableDataAppParams> &
  Pick<EditableDataAppParams, "name">;

type UpdateDataAppParams = Pick<DataApp, "id" | "collection_id"> & {
  collection: Pick<Collection, "name" | "description">;
};

export type ScaffoldNewAppParams = {
  name: EditableDataAppParams["name"];
  tables: number[]; // list of table IDs
};

export type ScaffoldNewPagesParams = {
  dataAppId: DataApp["id"];
  tables: number[]; // list of table IDs
};

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
      return DataAppsApi.create({
        ...dataAppProps,
        collection: {
          name,
          description: description || null,
          color: color(DEFAULT_COLLECTION_COLOR_ALIAS),
        },
      });
    },
    update: async ({
      id,
      collection,
      collection_id,
      ...rest
    }: UpdateDataAppParams) => {
      await CollectionsApi.update({ ...collection, id: collection_id });
      return DataAppsApi.update({ id, ...rest });
    },
  },

  objectActions: {
    scaffoldNewApp: async ({ name, tables }: ScaffoldNewAppParams) => {
      const dataApp = await DataAppsApi.scaffoldNewApp({
        "app-name": name,
        "table-ids": tables,
      });
      return {
        type: DataApps.actionTypes.CREATE,
        payload: DataApps.normalize(dataApp),
      };
    },
    scaffoldNewPages: async ({ dataAppId, tables }: ScaffoldNewPagesParams) => {
      const dataApp = await DataAppsApi.scaffoldNewPages({
        id: dataAppId,
        "table-ids": tables,
      });
      return {
        type: DataApps.actionTypes.UPDATE,
        payload: DataApps.normalize(dataApp),
      };
    },
  },

  objectSelectors: {
    getIcon: getDataAppIcon,
    getUrl: (dataApp: DataApp | DataAppSearchItem) => {
      return Urls.dataApp(dataApp, { mode: "preview" });
    },
  },

  forms: {
    create: {
      fields: createNewAppForm,
    },
    settings: {
      fields: createAppSettingsForm,
    },
  },

  reducer,
});

export * from "./utils";
export default DataApps;
