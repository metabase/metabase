import { t } from "ttag";
import {
  distributionDrill,
  distributionDrillQuestion,
} from "metabase-lib/queries/drills/distribution-drill";

export default ({ question, clicked }) => {
  if (!distributionDrill({ question, clicked })) {
    return [];
  }

  return [
    {
      name: "distribution",
      title: t`Distribution`,
      buttonType: "horizontal",
      section: "summarize",
      icon: "bar",
      question: () => distributionDrillQuestion({ question, clicked }),
    },
  ];
};
