import { t } from "ttag";
import { noop } from "underscore";

import { onUpdateVisualizationSettings } from "metabase/query_builder/actions";
import type { LegacyDrill } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";

export const hideSeriesAction: LegacyDrill = ({
  question,
  clicked,
  settings,
}) => {
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
        const seriesOrder = settings?.["graph.series_order"] ?? [];
        const clickedIndex = seriesOrder.findIndex(
          orderSetting => orderSetting.key === clicked.dimensions?.[0].value,
        );

        if (clickedIndex === -1) {
          return noop;
        }

        const newOrderSetting = {
          ...seriesOrder[clickedIndex],
          enabled: false,
        };
        const newSeriesOrder = [
          ...seriesOrder.slice(0, clickedIndex),
          newOrderSetting,
          ...seriesOrder.slice(clickedIndex + 1),
        ];

        return onUpdateVisualizationSettings({
          "graph.series_order": newSeriesOrder,
          // If we are writing a value for `graph.series_order` to store in the
          // DB, we also have to write one for `graph.series_order_dimension`.
          // fortunately we can just store the computed settings value that's
          // already in the `settings` arguement.
          "graph.series_order_dimension":
            settings?.["graph.series_order_dimension"],
        });
      },
    },
  ];
};
