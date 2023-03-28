import NativeQuery from "metabase-lib/queries/NativeQuery";
import Question from "metabase-lib/Question";

export const maybeGetNativeQueryText = (question?: Question | null) => {
  const query = question?.query();
  if (!(query instanceof NativeQuery)) {
    return undefined;
  }

  return query.queryText();
};
