/* eslint-disable flowtype/require-valid-file-annotation */

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

import { isSegmentFilter } from "metabase/lib/query/filter";
import { t } from "c-3po";

export default ({ question, settings }: ClickActionProps): ClickAction[] => {
  if (question.card().id && settings["enable_xrays"]) {
    return question
      .query()
      .filters()
      .filter(filter => isSegmentFilter(filter))
      .map(filter => {
        const id = filter[1];
        const segment = question.metadata().segments[id];
        const xraysegmentname = segment && segment.name;
        return {
          name: "xray-segment",
          title: t`X-ray ${xraysegmentname}`,
          icon: "beaker",
          url: () => `/xray/segment/${id}/approximate`,
        };
      });
  } else {
    return [];
  }
};
