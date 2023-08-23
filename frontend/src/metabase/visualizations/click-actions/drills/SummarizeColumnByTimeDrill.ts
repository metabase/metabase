import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types";
import {
  summarizeColumnByTimeDrill,
  summarizeColumnByTimeDrillQuestion,
} from "metabase-lib/queries/drills/summarize-column-by-time-drill";

const SummarizeColumnByTimeDrill: Drill = ({ question, clicked = {} }) => {
  if (!summarizeColumnByTimeDrill({ question, clicked })) {
    return [];
  }

  return [
    {
      name: "summarize-by-time",
      title: t`Sum over time`,
      section: "summarize",
      icon: "line",
      buttonType: "horizontal",
      question: () => summarizeColumnByTimeDrillQuestion({ question, clicked }),
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SummarizeColumnByTimeDrill;
