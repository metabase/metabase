import React, { Component } from "react";
import ReactDOM from "react-dom";
import styles from "./Legend.css";

import LegendItem from "./LegendItem.jsx";

import cx from "classnames";

export default class LegendHorizontal extends Component {
  render() {
    const { className, titles, colors, hovered, onHoverChange } = this.props;
    return (
      <ol
        ref="container"
        className={cx(className, styles.Legend, styles.horizontal)}
      >
        {titles.map((title, index) => (
          <li key={index}>
            <LegendItem
              ref={"legendItem" + index}
              title={title}
              color={colors[index % colors.length]}
              isMuted={
                hovered && hovered.index != null && index !== hovered.index
              }
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
        ))}
      </ol>
    );
  }
}
