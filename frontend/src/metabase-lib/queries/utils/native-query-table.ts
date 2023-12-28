import _ from "underscore";

import type Table from "metabase-lib/metadata/Table";

import type NativeQuery from "../NativeQuery";
import { getDatasetTable } from "./nested-card-query-table";

export function getNativeQueryTable(nativeQuery: NativeQuery): Table | null {
  const question = nativeQuery.question();
  const isDataset = question?.isDataset() && question.isSaved();

  if (isDataset) {
    return getDatasetTable(nativeQuery);
  }

  const database = nativeQuery.database();
  const collection = nativeQuery.collection();
  if (database && collection) {
    return (
      _.findWhere(database.getTables(), {
        name: collection,
      }) || null
    );
  }

  // Native queries aren't always associated with a specific table
  return null;
}
