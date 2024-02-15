import _ from "underscore";

import type Table from "metabase-lib/metadata/Table";

import type NativeQuery from "../NativeQuery";
import { getDatasetTable } from "./nested-card-query-table";

export function getNativeQueryTable(nativeQuery: NativeQuery): Table | null {
  const question = nativeQuery.question();
  const isModel = question.type() === "model" && question.isSaved();

  if (isModel) {
    return getDatasetTable(nativeQuery);
  }

  const database = question.database();
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
