import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface FallbackNativeDrillProps {
  question: Question;
}

export function nativeDrillFallback({ question }: FallbackNativeDrillProps) {
  const database = question.database();
  const query = question.query();
  const { isNative, isEditable } = Lib.queryDisplayInfo(query);

  if (!isNative || !isEditable || !database) {
    return null;
  }

  return {
    database,
  };
}
