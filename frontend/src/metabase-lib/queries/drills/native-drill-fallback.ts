import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";

interface FallbackNativeDrillProps {
  question: Question;
}

export function nativeDrillFallback({ question }: FallbackNativeDrillProps) {
  const database = question.database();
  const query = question.query();
  const { isEditable } = Lib.displayInfo(query, -1, query);

  if (!question.isNative() || !isEditable || !database) {
    return null;
  }

  return {
    database,
  };
}
