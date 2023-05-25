import React from "react";
import {
  quickFilterDrill,
  quickFilterDrillQuestion,
} from "metabase-lib/queries/drills/quick-filter-drill";
import type { Drill } from "../../types";

const QuickFilterDrill: Drill = ({ question, clicked }) => {
  const drill = quickFilterDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  return drill.operators.map(({ name, filter }) => ({
    name,
    title: <span className="h2">{name}</span>,
    section: "filter",
    buttonType: "token-filter",
    question: () => quickFilterDrillQuestion({ question, clicked, filter }),
  }));
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuickFilterDrill;
