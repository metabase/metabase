import type { ReactNode } from "react";
import { useCallback } from "react";

import type { IconProps } from "metabase/ui";
import type { OnChangeCardAndRun } from "metabase/visualizations/types";
import type {
  Series,
  TransformedSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { ChartCaptionRoot } from "./ChartCaption.styled";

interface ChartCaptionProps {
  series: Series | null;
  settings: VisualizationSettings;
  icon?: IconProps | null;
  actionButtons?: ReactNode;
  hasInfoTooltip?: boolean;
  width?: number;
  getHref?: () => string | undefined;
  titleMenuItems?: React.ReactNode;
  onChangeCardAndRun?: OnChangeCardAndRun | null;
}

const ChartCaption = ({
  series,
  settings,
  icon,
  actionButtons,
  hasInfoTooltip,
  onChangeCardAndRun,
  getHref,
  width,
  titleMenuItems,
}: ChartCaptionProps) => {
  const title = settings["card.title"] ?? series?.[0].card.name ?? "";
  const description = settings["card.description"];
  const data = (series as TransformedSeries)._raw || series;
  const card = data[0].card;
  const cardIds = new Set(data.map((s) => s.card.id));
  const canSelectTitle = cardIds.size === 1 && onChangeCardAndRun;

  const handleSelectTitle = useCallback(() => {
    onChangeCardAndRun?.({ nextCard: card });
  }, [card, onChangeCardAndRun]);

  return (
    <ChartCaptionRoot
      title={title}
      description={description}
      getHref={canSelectTitle ? getHref : undefined}
      icon={icon}
      actionButtons={actionButtons}
      hasInfoTooltip={hasInfoTooltip}
      onSelectTitle={canSelectTitle ? handleSelectTitle : undefined}
      width={width}
      titleMenuItems={titleMenuItems}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartCaption;
