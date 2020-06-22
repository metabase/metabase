import React from "react";

export const TitleLegendHeader = ({
  series,
  settings,
  onChangeCardAndRun,
  actionButtons,
}) => {
  // $FlowFixMe
  //const originalSeries = series._raw || series;
  //const cardIds = _.uniq(originalSeries.map(s => s.card.id));
  //const isComposedOfMultipleQuestions = cardIds.length > 1;

  if (settings["card.title"]) {
    return (
      <div className="flex-no-shrink m1 flex align-center">
        <h3 style={{ fontSize: 14 }}>{settings["card.title"]}</h3>
        <div className="flex ml-auto">{actionButtons}</div>
      </div>
    );
  } else {
    // If the title isn't provided in settings, render nothing
    return null;
  }
};
