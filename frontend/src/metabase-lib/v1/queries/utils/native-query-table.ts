import _ from "underscore";

import type Table from "metabase-lib/v1/metadata/Table";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";

import type NativeQuery from "../NativeQuery";

export function getNativeQueryTable(nativeQuery: NativeQuery): Table | null {
  const question = nativeQuery.question();
  const isModel = question.type() === "model" && question.isSaved();

  if (isModel) {
    return question.metadata().table(getQuestionVirtualTableId(question.id()));
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
