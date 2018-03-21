/* @flow */

import { inflect } from "metabase/lib/formatting";
import { utf8_to_b64url } from "metabase/lib/card";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { t } from "c-3po";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  // saved questions only, for now
  if (question.id() == null) {
    return [];
  }

  // questions with a breakout
  const dimensions = (clicked && clicked.dimensions) || [];
  if (!clicked || dimensions.length === 0) {
    return [];
  }

  return [
    {
      name: "exploratory-dashboard",
      section: "auto",
      title: t`Create exploratory dashboard`,
      url: () => {
        const filters = question
          .drillUnderlyingRecords(dimensions)
          .query()
          .filters();
        const filter = filters.length > 1 ? ["and", ...filters] : filters[0];
        const cellQuery = utf8_to_b64url(JSON.stringify(filter));
        return `/auto/dashboard/question/${question.id()}/cell/${cellQuery}`;
      },
    },
  ];
};
