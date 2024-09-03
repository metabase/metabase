/* eslint-disable react/prop-types */
/* eslint-disable react/no-string-refs */
import cx from "classnames";
import { Component } from "react";
import ReactDOM from "react-dom";

import LegendS from "./Legend.module.css";
import LegendItem from "./LegendItem";

export default class LegendHorizontal extends Component {
  render() {
    const {
      className,
      titles,
      colors,
      hiddenIndices,
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
              element: ReactDOM.findDOMNode(this.refs["legendItem" + index]),
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
                ref={this["legendItem" + index]}
                title={title}
                color={colors[index % colors.length]}
                isMuted={isMuted}
                isVisible={isVisible}
                showTooltip={false}
                onMouseEnter={() => {
                  if (isVisible) {
                    handleMouseEnter();
                  }
                }}
                onMouseLeave={handleMouseLeave}
                onToggleSeriesVisibility={event => {
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
