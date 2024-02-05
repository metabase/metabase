import * as Lib from "metabase-lib";

/**
 * We can only "explore results" (i.e. create new questions based on this one)
 * when question is a native query, which is saved, has no parameters
 * and satisfies other conditionals below.
 */
export const canExploreResults = question => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  const canNest = Boolean(question.database()?.hasFeature("nested-queries"));

  return (
    isNative &&
    question.isSaved() &&
    question.parameters().length === 0 &&
    canNest &&
    isEditable // originally "canRunAdhocQuery"
  );
};
