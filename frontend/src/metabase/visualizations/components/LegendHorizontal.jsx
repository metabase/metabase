/* eslint-disable react/prop-types */
/* eslint-disable react/no-string-refs */
import { Component } from "react";
import ReactDOM from "react-dom";
import cx from "classnames";
import styles from "./Legend.css";

import LegendItem from "./LegendItem";

export default class LegendHorizontal extends Component {
  render() {
    const { className, titles, colors, hovered, onHoverChange } = this.props;
    return (
      <ol className={cx(className, styles.Legend, styles.horizontal)}>
        {titles.map((title, index) => {
          const isMuted =
            hovered && hovered.index != null && index !== hovered.index;
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
                showTooltip={false}
                onMouseEnter={() =>
                  onHoverChange &&
                  onHoverChange({
                    index,
                    element: ReactDOM.findDOMNode(
                      this.refs["legendItem" + index],
                    ),
                  })
                }
                onMouseLeave={() => onHoverChange && onHoverChange(null)}
              />
            </li>
          );
        })}
      </ol>
    );
  }
}
