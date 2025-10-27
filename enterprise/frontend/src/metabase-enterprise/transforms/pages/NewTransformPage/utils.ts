import Question from "metabase-lib/v1/Question";
import type { QueryTransformSource } from "metabase-types/api";

export function getQueryInitialSource(): QueryTransformSource {
  const question = Question.create({ DEPRECATED_RAW_MBQL_type: "query" });
  return {
    type: "query",
    query: question.datasetQuery(),
  };
}

export function getNativeInitialSource(): QueryTransformSource {
  const question = Question.create({ DEPRECATED_RAW_MBQL_type: "native" });
  return {
    type: "query",
    query: question.datasetQuery(),
  };
}
