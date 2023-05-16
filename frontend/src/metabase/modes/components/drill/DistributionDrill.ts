import { t } from "ttag";
import {
  distributionDrill,
  distributionDrillQuestion,
} from "metabase-lib/queries/drills/distribution-drill";
import type { Drill } from "../../types";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DistributionDrill;
