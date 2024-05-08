import { t } from "ttag";
import { noop } from "underscore";

import type { LegacyDrill } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";

export const hideSeriesAction: LegacyDrill = ({ question, clicked }) => {
  const { isEditable } = Lib.queryDisplayInfo(question.query());

  const isLegendClick =
    clicked?.column == null && clicked?.extraData?.isRawTable === false;

  if (!clicked || !isLegendClick || !isEditable) {
    return [];
  }

  return [
    {
      name: "hide-series",
      title: t`Hide series`,
      section: "records",
      icon: "eye_crossed_out",
      buttonType: "horizontal",
      default: true,
      action: () => {
        clicked?.extraData?.onLegendClick(); // TODO fix type
        return noop;
      },
    },
  ];
};
