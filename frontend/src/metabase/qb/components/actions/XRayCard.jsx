/* @flow */

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

import { t } from "c-3po";
import { utf8_to_b64url } from "metabase/lib/card";

export default ({ question }: ClickActionProps): ClickAction[] => {
  return [
    {
      name: "xray-card",
      title: t`X-Ray this question`,
      icon: "beaker",
      url: () =>
        question.card().id
          ? `/auto/dashboard/question/${question.card().id}`
          : `/auto/dashboard/adhoc/${utf8_to_b64url(
              JSON.stringify(question.card().dataset_query),
            )}`,
    },
  ];
};
