import React, { ReactNode } from "react";
import { LegendAddIcon, LegendButtonGroup, LegendRoot } from "./Legend.styled";
import LegendItem from "./LegendItem";

type Props = {
  className?: string,
  classNameWidgets?: string,
  items: string[] | string[][],
  colors: string[],
  actionButtons?: ReactNode,
  hovered?: HoveredItem,
  isVertical?: boolean,
  showDots?: boolean,
  showItems?: boolean,
  showTooltip?: boolean,
  showDotTooltip?: boolean,
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
    className,
    classNameWidgets,
    items,
    colors,
    actionButtons,
    hovered,
    isVertical,
    showDots,
    showItems,
    showTooltip,
    showDotTooltip,
    onHoverChange,
    onAddSeries,
    onSelectSeries,
    onRemoveSeries,
  } = props;

  return (
    <LegendRoot className={className} isVertical={isVertical}>
      {items.map((title, index) => (
        <LegendItem
          key={index}
          title={title}
          index={index}
          color={colors[index % colors.length]}
          isMuted={hovered && hovered.index != null && index !== hovered.index}
          isVertical={isVertical}
          showDot={showDots}
          showTitle={showItems}
          showTooltip={showTooltip}
          showDotTooltip={showDotTooltip}
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
