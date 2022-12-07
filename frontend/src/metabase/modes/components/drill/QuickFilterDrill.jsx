/* eslint-disable react/prop-types */
import React from "react";
import {
  quickFilterDrill,
  quickFilterDrillQuestion,
} from "metabase-lib/queries/drills/quick-filter-drill";

export default function QuickFilterDrill({ question, clicked }) {
  const drill = quickFilterDrill({ question, clicked });
  if (!drill) {
    return [];
  }

  const { operators } = drill;

  return operators.map(({ name, operator }) => ({
    name: operator,
    section: "filter",
    buttonType: "token-filter",
    title: <span className="h2">{name}</span>,
    question: () => quickFilterDrillQuestion({ question, clicked, operator }),
  }));
}
