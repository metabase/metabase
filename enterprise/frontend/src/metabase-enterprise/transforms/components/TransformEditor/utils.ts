import { t } from "ttag";

import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { QueryTransformSource } from "metabase-types/api";

import type { ValidationResult } from "./EditorHeader/types";

export function getQuery(source: QueryTransformSource, metadata: Metadata) {
  return Question.create({ dataset_query: source.query, metadata }).query();
}

export function getValidationResult(query: Lib.Query): ValidationResult {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    const tags = Object.values(Lib.templateTags(query));
    if (tags.some((t) => t.type !== "card" && t.type !== "snippet")) {
      return {
        isValid: false,
        errorMessage: t`In transforms, you can use snippets and question or model references, but not variables.`,
      };
    }
  }

  return { isValid: Lib.canSave(query, "question") };
}
