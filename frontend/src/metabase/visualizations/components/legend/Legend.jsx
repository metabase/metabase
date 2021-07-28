import React, { ReactNode } from "react";
import { LegendAddIcon, LegendButtonGroup, LegendRoot } from "./Legend.styled";
import LegendItem from "./LegendItem";

type Props = {
  titles: string[] | string[][],
  colors: string[],
  description?: string,
  actionButtons?: ReactNode,
  hovered?: HoveredItem,
  isVertical?: boolean,
  showDots?: boolean,
  showTitles?: boolean,
  showTooltip?: boolean,
  showDotTooltip?: boolean,
  className?: string,
  classNameWidgets?: string,
  onHoverChange: ({ index: number, element: Element }) => void,
  onAddSeries: () => void,
  onSelectSeries: (event: MouseEvent, index: number) => void,
  onRemoveSeries: (event: MouseEvent, index: number) => void,
};

type HoveredItem = {
  index: number,
};

const Legend = (props: Props) => {
  const {
    titles,
    colors,
    description,
    actionButtons,
    hovered,
    isVertical,
    showDots,
    showTitles,
    showTooltip,
    showDotTooltip,
    className,
    classNameWidgets,
    onHoverChange,
    onAddSeries,
    onSelectSeries,
    onRemoveSeries,
  } = props;

  return (
    <LegendRoot className={className} isVertical={isVertical}>
      {titles.map((title, index) => (
        <LegendItem
          key={index}
          title={title}
          index={index}
          color={colors[index % colors.length]}
          description={description}
          isMuted={hovered && hovered.index != null && index !== hovered.index}
          isVertical={isVertical}
          showDot={showDots}
          showTitle={showTitles}
          showTooltip={showTooltip}
          showDotTooltip={showDotTooltip}
          classNameWidgets={classNameWidgets}
          onHoverChange={onHoverChange}
          onSelectSeries={onSelectSeries}
          onRemoveSeries={onRemoveSeries}
        />
      ))}
      {onAddSeries && <LegendAddIcon onClick={onAddSeries} />}
      {actionButtons && (
        <LegendButtonGroup className={classNameWidgets}>
          {actionButtons}
        </LegendButtonGroup>
      )}
    </LegendRoot>
  );
};

export default Legend;
