import { t } from "ttag";

import type { QueryEditorUiOptions } from "metabase/querying/editor/types";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Database, QueryTransformSource } from "metabase-types/api";

import { doesDatabaseSupportTransforms } from "../../utils";

export function getQuery(source: QueryTransformSource, metadata: Metadata) {
  return Question.create({ dataset_query: source.query, metadata }).query();
}

export function getEditorOptions(databases: Database[]): QueryEditorUiOptions {
  return {
    canConvertToNative: true,
    convertToNativeTitle: t`SQL for this transform`,
    convertToNativeButtonLabel: t`Convert this transform to SQL`,
    shouldDisableDatabasePickerItem: (item) => {
      const database = databases.find((database) => database.id === item.id);
      return !doesDatabaseSupportTransforms(database);
    },
    shouldDisableDataPickerItem: (item) => {
      if (item.model === "database") {
        const database = databases.find((db) => db.id === item.id);
        return !doesDatabaseSupportTransforms(database);
      }

      if (
        item.model === "card" ||
        item.model === "dataset" ||
        item.model === "metric" ||
        item.model === "table"
      ) {
        const database = databases.find((db) => db.id === item.database_id);
        return !doesDatabaseSupportTransforms(database);
      }

      if (item.model === "dashboard") {
        return true;
      }

      return false;
    },
  };
}
