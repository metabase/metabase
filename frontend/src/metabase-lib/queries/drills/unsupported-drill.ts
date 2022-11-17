import Question from "metabase-lib/Question";

interface UnsupportedDrillProps {
  question: Question;
}

export function unsupportedDrill({ question }: UnsupportedDrillProps) {
  const query = question.query();
  return question.isNative() && query.isEditable();
}
