import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import { ChartHeaderRoot } from "./ChartHeader.styled";

const propTypes = {
  series: PropTypes.array.isRequired,
  settings: PropTypes.object.isRequired,
  icon: PropTypes.shape(iconPropTypes),
  actionButtons: PropTypes.node,
  onChangeCardAndRun: PropTypes.func,
};

const ChartHeader = ({
  series,
  settings,
  icon,
  actionButtons,
  onChangeCardAndRun,
}) => {
  const title = settings["card.title"] || series[0].card.name;
  const description = series["card.description"];
  const data = series._raw || series;
  const card = data[0].card;
  const cardIds = new Set(data.map(s => s.card.id));
  const canClickTitle = cardIds.size === 1 && onChangeCardAndRun;

  const handleTitleClick = useCallback(() => {
    onChangeCardAndRun({
      nextCard: card,
      seriesIndex: 0,
    });
  }, [card, onChangeCardAndRun]);

  if (!title) {
    return null;
  }

  return (
    <ChartHeaderRoot
      className="mx1 flex-no-shrink"
      title={title}
      description={description}
      icon={icon}
      actionButtons={actionButtons}
      onTitleClick={canClickTitle ? handleTitleClick : undefined}
    />
  );
};

ChartHeader.propTypes = propTypes;

export default ChartHeader;
