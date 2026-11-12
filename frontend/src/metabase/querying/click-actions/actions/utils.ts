import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface FallbackNativeDrillProps {
  question: Question;
}

export function nativeDrillFallback({ question }: FallbackNativeDrillProps) {
  const query = question.query();
  const database = Lib.databaseMetadata(query);
  const isSaved = question.isSaved();
  const { isNative, isEditable } = Lib.queryDisplayInfo(query);

  return !(isSaved || !isNative || !isEditable || !database);
}
