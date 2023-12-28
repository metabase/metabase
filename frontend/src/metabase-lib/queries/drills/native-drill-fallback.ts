import type Question from "metabase-lib/Question";

interface FallbackNativeDrillProps {
  question: Question;
}

export function nativeDrillFallback({ question }: FallbackNativeDrillProps) {
  const database = question.database();
  if (!question.isNative() || !question.isQueryEditable() || !database) {
    return null;
  }

  return {
    database,
  };
}
