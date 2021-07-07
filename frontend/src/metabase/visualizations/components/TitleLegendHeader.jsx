/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { getIn } from "icepick";

import LegendHeader from "./LegendHeader";

export default function TitleLegendHeader({
  series,
  settings,
  onChangeCardAndRun,
  actionButtons,
}) {
  const originalSeries = series._raw || series;
  const cardIds = _.uniq(originalSeries.map(s => s.card.id));
  const isComposedOfMultipleQuestions = cardIds.length > 1;
  const name = settings["card.title"] || getIn(series, [0, "card", "name"]);

  if (name) {
    const titleHeaderSeries = [
      {
        card: {
          name,
          ...(isComposedOfMultipleQuestions
            ? {}
            : {
                id: cardIds[0],
                dataset_query: originalSeries[0].card.dataset_query,
                display: originalSeries[0].card.display,
              }),
        },
      },
    ];

    return (
      <LegendHeader
        className="flex-no-shrink"
        series={titleHeaderSeries}
        description={settings["card.description"]}
        actionButtons={actionButtons}
        // If a dashboard card is composed of multiple questions, its custom card title
        // shouldn't act as a link as it's ambiguous that which question it should open
        onChangeCardAndRun={
          isComposedOfMultipleQuestions ? null : onChangeCardAndRun
        }
      />
    );
  } else {
    // If the title isn't provided in settings, render nothing
    return null;
  }
}
