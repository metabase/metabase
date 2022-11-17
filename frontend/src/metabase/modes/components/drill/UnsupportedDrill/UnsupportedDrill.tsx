import { t } from "ttag";
import Question from "metabase-lib/Question";
import { unsupportedDrill } from "metabase-lib/queries/drills/unsupported-drill";

interface UnsupportedDrillProps {
  question: Question;
}

const UnsupportedDrill = ({ question }: UnsupportedDrillProps) => {
  if (!unsupportedDrill({ question })) {
    return [];
  }

  return [
    {
      name: "unsupported",
      section: "info",
      buttonType: "info",
      title: t`Drill-through doesn’t work on SQL questions.`,
    },
  ];
};

export default UnsupportedDrill;
