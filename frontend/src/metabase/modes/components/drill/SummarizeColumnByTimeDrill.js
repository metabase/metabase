import { t } from "ttag";
import {
  summarizeColumnByTimeDrill,
  summarizeColumnByTimeDrillQuestion,
} from "metabase-lib/lib/queries/drills/summarize-column-by-time-drill";

export default ({ question, clicked = {} }) => {
  if (!summarizeColumnByTimeDrill({ question, clicked })) {
    return [];
  }

  return [
    {
      name: "summarize-by-time",
      buttonType: "horizontal",
      section: "summarize",
      icon: "line",
      title: t`Sum over time`,
      question: () => summarizeColumnByTimeDrillQuestion({ question, clicked }),
    },
  ];
};
