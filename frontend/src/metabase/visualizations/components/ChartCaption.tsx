import type { ReactNode } from "react";
import { useCallback } from "react";
import type { IconProps } from "metabase/core/components/Icon";
import type {
  Series,
  TransformedSeries,
  VisualizationSettings,
} from "metabase-types/api";
import { ChartCaptionRoot } from "./ChartCaption.styled";

interface ChartCaptionProps {
  series: Series;
  settings: VisualizationSettings;
  icon?: IconProps;
  actionButtons?: ReactNode;
  onChangeCardAndRun: (data: Record<string, unknown>) => void;
}

const ChartCaption = ({
  series,
  settings,
  icon,
  actionButtons,
  onChangeCardAndRun,
}: ChartCaptionProps) => {
  const title = settings["card.title"] ?? series[0].card.name;
  const description = settings["card.description"];
  const data = (series as TransformedSeries)._raw || series;
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartCaption;
