import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import { ChartCaptionRoot } from "./ChartCaption.styled";
import { t } from "ttag";

const propTypes = {
  series: PropTypes.array.isRequired,
  settings: PropTypes.object.isRequired,
  icon: PropTypes.shape(iconPropTypes),
  actionButtons: PropTypes.node,
  isVirtual: PropTypes.bool,
  onChangeCardAndRun: PropTypes.func,
};

const ChartCaption = ({
  series,
  settings,
  icon,
  actionButtons,
  isVirtual,
  onChangeCardAndRun,
}) => {
  const title = isVirtual
    ? t`Text card`
    : settings["card.title"] ?? series[0].card.name;
  const description = settings["card.description"];
  const data = series._raw || series;
  const card = data[0].card;
  const cardIds = new Set(data.map(s => s.card.id));
  const canSelectTitle = cardIds.size === 1 && onChangeCardAndRun;

  const handleSelectTitle = useCallback(() => {
    onChangeCardAndRun({
      nextCard: card,
      seriesIndex: 0,
    });
  }, [card, onChangeCardAndRun]);

  if (!title) {
    return null;
  }

  return (
    <ChartCaptionRoot
      title={title}
      description={description}
      icon={icon}
      actionButtons={actionButtons}
      onSelectTitle={canSelectTitle ? handleSelectTitle : undefined}
    />
  );
};

ChartCaption.propTypes = propTypes;

export default ChartCaption;
