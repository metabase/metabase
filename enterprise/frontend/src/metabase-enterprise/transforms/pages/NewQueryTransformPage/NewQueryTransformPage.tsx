import { useState } from "react";

import Question from "metabase-lib/v1/Question";

import { TransformEditor } from "../../components/TransformEditor";
import type { TransformInfo } from "../../types";

type NewTransformPageParams = {
  databaseId?: string;
};

type NewQueryTransformPageProps = {
  params?: NewTransformPageParams;
};

export function NewQueryTransformPage({
  params = {},
}: NewQueryTransformPageProps) {
  const [transform] = useState(() => getInitialTransform(params));
  return <TransformEditor transform={transform} />;
}

function getDatabaseId({ databaseId = "" }: NewTransformPageParams) {
  return parseInt(databaseId, 10);
}

function getInitialTransform(params: NewTransformPageParams): TransformInfo {
  const databaseId = getDatabaseId(params);
  return {
    query: Question.create({ type: "query", databaseId }).datasetQuery(),
  };
}
