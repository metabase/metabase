/* @flow */

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";
import { t } from "c-3po";

export default ({ question, settings }: ClickActionProps): ClickAction[] => {
  // currently time series xrays require the maximum fidelity
  if (
    question.card().id &&
    settings["enable_xrays"] &&
    settings["xray_max_cost"] === "extended"
  ) {
    return [
      {
        name: "xray-card",
        title: t`Analyze this question`,
        icon: "beaker",
        url: () => `/xray/card/${question.card().id}/extended`,
      },
    ];
  } else {
    return [];
  }
};
