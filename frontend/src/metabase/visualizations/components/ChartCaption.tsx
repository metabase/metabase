import type { ReactNode } from "react";
import { useCallback } from "react";

import type { IconProps } from "metabase/ui";
import type { OnChangeCardAndRun } from "metabase/visualizations/types";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

import { ChartCaptionRoot } from "./ChartCaption.styled";

interface ChartCaptionProps {
  series: RawSeries;
  settings: VisualizationSettings;
  icon?: IconProps;
  actionButtons?: ReactNode;
  width?: number;
  href?: string;
  onChangeCardAndRun: OnChangeCardAndRun;
}

const ChartCaption = ({
  series,
  settings,
  icon,
  actionButtons,
  onChangeCardAndRun,
  href,
  width,
}: ChartCaptionProps) => {
  const title = settings["card.title"] ?? series[0].card.name;
  const description = settings["card.description"];
  const card = series[0].card;
  const cardIds = new Set(series.map(s => s.card.id));
  const canSelectTitle = cardIds.size === 1 && onChangeCardAndRun;

  const handleSelectTitle = useCallback(() => {
    onChangeCardAndRun({
      nextCard: card,
    });
  }, [card, onChangeCardAndRun]);

  return (
    <ChartCaptionRoot
      title={title}
      description={description}
      href={href}
      icon={icon}
      actionButtons={actionButtons}
      onSelectTitle={canSelectTitle ? handleSelectTitle : undefined}
      width={width}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartCaption;
