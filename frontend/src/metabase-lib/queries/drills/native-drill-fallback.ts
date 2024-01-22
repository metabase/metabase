import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";

interface FallbackNativeDrillProps {
  question: Question;
}

export function nativeDrillFallback({ question }: FallbackNativeDrillProps) {
  const database = question.database();
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  if (!isNative || !question.isQueryEditable() || !database) {
    return null;
  }

  return {
    database,
  };
}
