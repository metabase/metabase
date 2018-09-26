/* @flow */

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

import { t } from "c-3po";
import { utf8_to_b64url } from "metabase/lib/card";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

export default ({ question }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }
  if (!query.isBareRows()) {
    return [];
  }
  if (query.filters().length == 0) {
    return [];
  }

  const tableId = query.tableId();
  if (tableId) {
    return [
      {
        name: "xray-card",
        title: t`Compare this with all rows in the table`,
        icon: "beaker",

        url: () =>
          question.card().id
            ? `/auto/dashboard/table/${tableId}/compare/question/${
                question.card().id
              }`
            : `/auto/dashboard/table/${tableId}/compare/adhoc/${utf8_to_b64url(
                JSON.stringify(question.card().dataset_query),
              )}`,
      },
    ];
  } else {
    return [];
  }
};
