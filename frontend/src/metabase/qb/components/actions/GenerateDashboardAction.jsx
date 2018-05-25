/* @flow */

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { utf8_to_b64url } from "metabase/lib/card";
import { t } from "c-3po";

export default ({ question, settings }: ClickActionProps): ClickAction[] => {
  console.log(JSON.stringify(question.query().datasetQuery()));
  let dashboard_url = "adhoc";

  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  // aggregations
  if (query.aggregations().length) {
    return [];
  }
  if (question.card().id) {
    dashboard_url = `/auto/dashboard/question/${question.card().id}`;
  } else {
    let encodedQueryDict = utf8_to_b64url(
      JSON.stringify(question.query().datasetQuery()),
    );
    dashboard_url = `/auto/dashboard/adhoc/${encodedQueryDict}`;
  }
  return [
    {
      name: "generate-dashboard",
      title: t`See an exploration of this question`,
      icon: "bolt",
      url: () => dashboard_url,
    },
  ];
};
