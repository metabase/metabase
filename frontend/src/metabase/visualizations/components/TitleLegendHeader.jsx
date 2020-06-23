import React from "react";
import cx from "classnames";
import _ from "underscore";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";

export const TitleLegendHeader = ({
  series,
  settings,
  onChangeCardAndRun,
  actionButtons,
  infoClassName,
}) => {
  const index = 0;
  // $FlowFixMe
  const originalSeries = series._raw || series;
  const cardIds = _.uniq(originalSeries.map(s => s.card.id));
  const isComposedOfMultipleQuestions = cardIds.length > 1;
  const clickableTitle = onChangeCardAndRun && !isComposedOfMultipleQuestions;

  const [{ card: firstCard }] = originalSeries;
  const title = settings["card.title"];
  const description = settings["card.description"];

  return (
    <div className="flex">
      {title && (
        <div
          className={cx(
            { "cursor-pointer": clickableTitle },
            "flex align-center overflow-hidden",
          )}
          onClick={
            clickableTitle
              ? () =>
                  onChangeCardAndRun({
                    nextCard: firstCard,
                  })
              : null
          }
        >
          <Ellipsified className="text-bold">{title}</Ellipsified>
          {description && !actionButtons && (
            <div className="hover-child ml1 flex align-center text-medium">
              <Tooltip tooltip={description} maxWidth={"22em"}>
                <Icon className={infoClassName} name="info" />
              </Tooltip>
            </div>
          )}
        </div>
      )}
      <div className="flex ml-auto">{actionButtons}</div>
    </div>
  );
};
