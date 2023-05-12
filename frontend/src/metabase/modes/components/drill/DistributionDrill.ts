import { t } from "ttag";
import type { Drill } from "metabase/modes/types";
import {
  distributionDrill,
  distributionDrillQuestion,
} from "metabase-lib/queries/drills/distribution-drill";

const DistributionDrill: Drill = ({ question, clicked }) => {
  if (!distributionDrill({ question, clicked })) {
    return [];
  }

  return [
    {
      name: "distribution",
      title: t`Distribution`,
      section: "summarize",
      icon: "bar",
      buttonType: "horizontal",
      question: () => distributionDrillQuestion({ question, clicked }),
    },
  ];
};

export default DistributionDrill;
