import type Question from "metabase-lib/Question";

interface FallbackNativeDrillProps {
  question: Question;
}

export function nativeDrillFallback({ question }: FallbackNativeDrillProps) {
  const query = question.query();
  const database = question.database();
  if (!question.isNative() || !query.isEditable() || !database) {
    return null;
  }

  return {
    database,
  };
}
