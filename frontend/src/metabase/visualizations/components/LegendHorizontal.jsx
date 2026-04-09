/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";

import LegendS from "./Legend.module.css";
import { LegendItem } from "./LegendItem";

export class LegendHorizontal extends Component {
  constructor(props) {
    super(props);

    /** @type {Record<number, LegendItem | null>} */
    this.legendItemRefs = {};
  }

  render() {
    const {
      className,
      titles,
      colors,
      dotSize,
      hiddenIndices = [],
      hovered,
      onHoverChange,
      onToggleSeriesVisibility,
    } = this.props;
    return (
      <ol className={cx(className, LegendS.Legend, LegendS.horizontal)}>
        {titles.map((title, index) => {
          const isMuted =
            hovered && hovered.index != null && index !== hovered.index;
          const isVisible = !hiddenIndices.includes(index);

          const handleMouseEnter = () => {
            onHoverChange?.({
              index,
              element: this.legendItemRefs[index]?.getRootElement(),
            });
          };

          const handleMouseLeave = () => {
            onHoverChange?.(null);
          };

          return (
            <li
              key={index}
              data-testid={`legend-item-${title}`}
              {...(hovered && { "aria-current": !isMuted })}
            >
              <LegendItem
                ref={(legendItem) => {
                  this.legendItemRefs[index] = legendItem;
                }}
                title={title}
                color={colors[index % colors.length]}
                dotSize={dotSize}
                isMuted={isMuted}
                isVisible={isVisible}
                showTooltip={false}
                onMouseEnter={() => {
                  if (isVisible) {
                    handleMouseEnter();
                  }
                }}
                onMouseLeave={handleMouseLeave}
                onToggleSeriesVisibility={(event) => {
                  if (isVisible) {
                    handleMouseLeave();
                  } else {
                    handleMouseEnter();
                  }
                  onToggleSeriesVisibility(event, index);
                }}
              />
            </li>
          );
        })}
      </ol>
    );
  }
}
