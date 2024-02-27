/**
 * A Model index is a separate entity in the metabase backend which is used to index a particular field
 * in a model in connection with a primary key, so that the model can be queried by the indexed field.
 * This allows us to use search results to show a particular record in the model.
 */

import { modelIndexesApi } from "metabase/api";

import { updateModelIndexes } from "./actions";
import {
  canIndexField,
  getPkRef,
  fieldHasIndex,
  cleanIndexFlags,
} from "./utils";

export const ModelIndexes = {
  api: modelIndexesApi,
  actions: {
    updateModelIndexes,
  },
  utils: {
    canIndexField,
    getPkRef,
    fieldHasIndex,
    cleanIndexFlags,
  },
  useListQuery: modelIndexesApi.useListModelIndexesQuery,
};
