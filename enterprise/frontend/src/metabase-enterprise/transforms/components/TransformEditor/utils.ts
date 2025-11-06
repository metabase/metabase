import { t } from "ttag";

import type { QueryEditorUiOptions } from "metabase/querying/editor/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Database, QueryTransformSource } from "metabase-types/api";

import { doesDatabaseSupportTransforms } from "../../utils";

import type { ValidationResult } from "./EditorHeader/types";

export function getQuery(source: QueryTransformSource, metadata: Metadata) {
  return Question.create({ dataset_query: source.query, metadata }).query();
}

const ALLOWED_TRANSFORM_VARIABLES = ["watermark", "limit"];

export function getValidationResult(query: Lib.Query): QueryValidationResult {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    const tags = Object.values(Lib.templateTags(query));
    // Allow snippets, cards, and the special transform variables (watermark)
    const hasInvalidTags = tags.some(
      (t) =>
        t.type !== "card" &&
        t.type !== "snippet" &&
        !ALLOWED_TRANSFORM_VARIABLES.includes(t.name),
    );
    if (hasInvalidTags) {
      return {
        isValid: false,
        errorMessage: t`In transforms, you can use snippets and question or model references, but not variables.`,
      };
    }
  }

  return { isValid: Lib.canSave(query, "question") };
}

export function getEditorOptions(databases: Database[]): QueryEditorUiOptions {
  return {
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
