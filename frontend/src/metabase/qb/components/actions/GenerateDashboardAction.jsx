/* @flow */

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";
import { utf8_to_b64url } from "metabase/lib/card";
import { t } from "c-3po";

export default ({ question, settings }: ClickActionProps): ClickAction[] => {
  // currently time series xrays require the maximum fidelity
  console.log(JSON.stringify(question.query().datasetQuery()));
  var dashboard_url = "adhoc";
  if (question.card().id) {
    dashboard_url = `/auto/dashboard/question/${question.card().id}`;
  } else {
    var encodedQueryDict = utf8_to_b64url(
      JSON.stringify(question.query().datasetQuery()),
    );
    dashboard_url = `/auto/dashboard/adhoc/${encodedQueryDict}`;
  }
  return [
    {
      name: "generate-dashboard",
      title: t`See an exploration of this question`,
      icon: "beaker",
      url: () => dashboard_url,
    },
  ];
};
