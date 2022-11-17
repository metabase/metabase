import Question from "metabase-lib/Question";

interface UnsupportedDrillProps {
  question: Question;
}

export function unsupportedDrill({ question }: UnsupportedDrillProps) {
  const query = question.query();
  const database = question.database();
  if (!question.isNative() || !query.isEditable() || !database) {
    return null;
  }

  return {
    database,
  };
}
