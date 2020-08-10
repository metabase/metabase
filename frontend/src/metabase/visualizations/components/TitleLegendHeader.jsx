import React from "react";
import LegendHeader from "./LegendHeader";
import _ from "underscore";

export const TitleLegendHeader = ({
  series,
  settings,
  onChangeCardAndRun,
  actionButtons,
}) => {
  // $FlowFixMe
  const originalSeries = series._raw || series;
  const cardIds = _.uniq(originalSeries.map(s => s.card.id));
  const isComposedOfMultipleQuestions = cardIds.length > 1;

  if (settings["card.title"]) {
    const titleHeaderSeries = [
      {
        card: {
          name: settings["card.title"],
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
};
