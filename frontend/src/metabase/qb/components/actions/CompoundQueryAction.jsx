/* @flow */

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";
import { t } from "c-3po";

export default ({ question }: ClickActionProps): ClickAction[] => {
  if (question.id()) {
    return [
      {
        name: "nest-query",
        title: t`Analyze the results of this Query`,
        icon: "table",
        question: () => question.composeThisQuery(),
      },
    ];
  }
  return [];
};
