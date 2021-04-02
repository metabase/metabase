/* eslint-disable react/prop-types */
import React, { Component } from "react";
import styles from "./Legend.css";

import LegendItem from "./LegendItem";

import cx from "classnames";

export default class LegendHorizontal extends Component {
  constructor(props) {
    super(props);

    props.titles.map((title, index) => {
      this["legendItem" + index] = React.createRef();
    });
  }
  render() {
    const { className, titles, colors, hovered, onHoverChange } = this.props;
    return (
      <ol className={cx(className, styles.Legend, styles.horizontal)}>
        {titles.map((title, index) => (
          <li key={index}>
            <LegendItem
              ref={this["legendItem" + index]}
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
                  element: this["legendItem" + index].current,
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
